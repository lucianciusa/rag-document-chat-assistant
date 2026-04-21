from openai import AzureOpenAI
import os

class ChatManager:
    def __init__(self, search_manager):
        self.search_manager = search_manager
        self.openai_client = AzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.chat_deployment = os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4o-mini")
        
    def generate_response(self, query: str, history: list, instructions: str, assistant_id: str):
        if not self.search_manager.endpoint:
            return "Azure Search not configured.", []
            
        vector_query = self.search_manager.generate_embeddings(query)
        
        # Hybrid search Request with Isolation via filter
        results = self.search_manager.search_client.search(
            search_text=query,
            filter=f"assistant_id eq '{assistant_id}'",
            vector_queries=[
                {
                    "kind": "vector",
                    "vector": vector_query,
                    "fields": "contentVector",
                    "k_nearest_neighbors": 5
                }
            ],
            top=5,
            semantic_configuration_name="default-semantic-config",
            query_type="semantic"
        )
        
        context_blocks = []
        citations = []
        for r in results:
            text = r["content"]
            source = r["filename"]
            context_blocks.append(f"[{source}]: {text}")
            citations.append(source)
            
        context = "\n\n".join(context_blocks)
        
        system_prompt = f"""{instructions}
        
        CRITICAL RULES:
        1. Answer the user's questions utilizing ONLY the following Context blocks. 
        2. If the context does not contain the answer, politely state that you do not know based on the provided documents (do not invent or hallucinate answers).
        3. Always cite the source document name using the format [filename.ext] when you use information from it.
        
        Context:
        {context}
        """
        
        messages = [{"role": "system", "content": system_prompt}]
        
        # appending history
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
            
        messages.append({"role": "user", "content": query})
        
        # economic generation with gpt-4o-mini
        response = self.openai_client.chat.completions.create(
            model=self.chat_deployment,
            messages=messages,
            temperature=0.2,
            max_tokens=800
        )
        
        return response.choices[0].message.content, list(set(citations))
