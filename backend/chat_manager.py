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

        reply = response.choices[0].message.content

        # Only return citations that were actually used (mentioned) in the completion.
        used_citations = [c for c in set(citations) if c in reply]

        return reply, used_citations

    def _build_messages(self, query: str, history: list, instructions: str, assistant_id: str):
        """Returns (messages, all_citations). Shared by sync + streaming variants."""
        if not self.search_manager.endpoint:
            return None, []

        vector_query = self.search_manager.generate_embeddings(query)
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
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": query})
        return messages, citations

    def stream_response(self, query: str, history: list, instructions: str, assistant_id: str):
        """Yields (kind, payload) tuples: ('token', str) for chunks, ('done', citations_list) at end."""
        messages, citations = self._build_messages(query, history, instructions, assistant_id)
        if messages is None:
            yield ("token", "Azure Search not configured.")
            yield ("done", [])
            return

        full_reply_parts = []
        stream = self.openai_client.chat.completions.create(
            model=self.chat_deployment,
            messages=messages,
            temperature=0.2,
            max_tokens=800,
            stream=True,
        )
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            piece = getattr(delta, "content", None)
            if piece:
                full_reply_parts.append(piece)
                yield ("token", piece)

        full_reply = "".join(full_reply_parts)
        used_citations = [c for c in set(citations) if c in full_reply]
        yield ("done", used_citations)
