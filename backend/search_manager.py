import os
from openai import AzureOpenAI
from azure.core.credentials import AzureKeyCredential
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents import SearchClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SimpleField,
    SearchField,
    SearchFieldDataType,
    SearchableField,
    SemanticConfiguration,
    SemanticPrioritizedFields,
    SemanticField,
    SemanticSearch,
    HnswAlgorithmConfiguration,
    VectorSearch,
    VectorSearchAlgorithmKind,
    VectorSearchProfile
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
import uuid

class SearchManager:
    def __init__(self):
        self.endpoint = os.getenv("AZURE_SEARCH_SERVICE_ENDPOINT")
        self.key = os.getenv("AZURE_SEARCH_ADMIN_KEY")
        self.index_name = os.getenv("AZURE_SEARCH_INDEX_NAME", "rag-index-economical")
        self.openai_client = AzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.embedding_deployment = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "text-embedding-3-small")
        self.credential = AzureKeyCredential(self.key) if self.key else None
        
        if self.endpoint and self.key:
            self.index_client = SearchIndexClient(endpoint=self.endpoint, credential=self.credential)
            self.search_client = SearchClient(endpoint=self.endpoint, index_name=self.index_name, credential=self.credential)

    def initialize_index(self):
        if not self.endpoint or not self.key:
            print("Azure Search variables not configured. Skipping index creation.")
            return

        try:
            self.index_client.get_index(self.index_name)
            print(f"Index {self.index_name} already exists.")
        except Exception:
            # Create schema for economical RAG
            fields = [
                SimpleField(name="id", type=SearchFieldDataType.String, key=True),
                SimpleField(name="assistant_id", type=SearchFieldDataType.String, filterable=True),
                SearchableField(name="content", type=SearchFieldDataType.String, analyzer_name="en.lucene"),
                SearchableField(name="filename", type=SearchFieldDataType.String, filterable=True, sortable=True),
                SearchField(name="contentVector", type=SearchFieldDataType.Collection(SearchFieldDataType.Single), 
                            searchable=True, vector_search_dimensions=1536, vector_search_profile_name="my-vector-profile")
            ]

            vector_search = VectorSearch(
                algorithms=[
                    HnswAlgorithmConfiguration(
                        name="my-hnsw-config",
                        kind=VectorSearchAlgorithmKind.HNSW,
                    )
                ],
                profiles=[
                    VectorSearchProfile(
                        name="my-vector-profile",
                        algorithm_configuration_name="my-hnsw-config",
                    )
                ]
            )

            semantic_config = SemanticConfiguration(
                name="default-semantic-config",
                prioritized_fields=SemanticPrioritizedFields(
                    content_fields=[SemanticField(field_name="content")],
                    title_field=SemanticField(field_name="filename"),
                )
            )

            semantic_search = SemanticSearch(configurations=[semantic_config])

            index = SearchIndex(name=self.index_name, fields=fields, 
                                vector_search=vector_search, semantic_search=semantic_search)
            
            self.index_client.create_index(index)
            print(f"Created index {self.index_name}.")

    def generate_embeddings(self, text: str):
        response = self.openai_client.embeddings.create(input=[text], model=self.embedding_deployment)
        return response.data[0].embedding

    def process_and_index_document(self, text_content: str, filename: str, assistant_id: str):
        if not self.endpoint or not self.key:
            raise ValueError("Search variables not configured in .env")

        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        chunks = splitter.split_text(text_content)
        
        docs_to_index = []
        for i, chunk in enumerate(chunks):
            vector = self.generate_embeddings(chunk)
            # Create document
            doc = {
                "id": str(uuid.uuid4()).replace("-", ""),
                "assistant_id": assistant_id,
                "content": chunk,
                "filename": filename,
                "contentVector": vector
            }
            docs_to_index.append(doc)
        
        result = self.search_client.upload_documents(documents=docs_to_index)
        return {"chunks": len(chunks), "status": "Uploaded"}
