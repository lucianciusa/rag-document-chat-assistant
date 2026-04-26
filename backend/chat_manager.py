from openai import AsyncAzureOpenAI
import os
import re

class ChatManager:
    def __init__(self, search_manager):
        self.search_manager = search_manager
        self.openai_client = AsyncAzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.chat_deployment = os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4o-mini")
        
    async def generate_response(self, query: str, history: list, instructions: str, assistant_id: str):
        messages, citations, context_blocks = await self._build_messages(query, history, instructions, assistant_id)
        if messages is None:
            return "Azure Search not configured.", [], []
            
        response = await self.openai_client.chat.completions.create(
            model=self.chat_deployment,
            messages=messages,
            temperature=0.2,
            max_tokens=800
        )

        reply = response.choices[0].message.content

        # Extract citations robustly
        found_cites = re.findall(r'\[([^\]]+)\]', reply)
        
        # Build map of granular citations AND base filenames
        normalized_granular = {c.lower(): c for c in citations}
        base_to_granular = {}
        for c in citations:
            base = c.split('#')[0].lower()
            if base not in base_to_granular: base_to_granular[base] = []
            base_to_granular[base].append(c)

        used_citations = []
        for fc in set(found_cites):
            fc_clean = fc.strip().lower()
            if fc_clean in normalized_granular:
                # Perfect granular match
                used_citations.append(normalized_granular[fc_clean])
            elif fc_clean in base_to_granular:
                # LLM cited base filename, fallback to including all chunks from that file
                used_citations.extend(base_to_granular[fc_clean])
        
        used_citations = list(set(used_citations)) # Deduplicate
        
        relevant_context = []
        for cite in used_citations:
            prefix = f"[{cite.lower()}]:"
            for block in context_blocks:
                if block.lower().startswith(prefix):
                    relevant_context.append(block)
        
        return reply, used_citations, relevant_context

    async def _build_messages(self, query: str, history: list, instructions: str, assistant_id: str):
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
        for i, r in enumerate(results):
            text = r["content"]
            source = r["filename"]
            # Use #index to allow granular citation
            context_blocks.append(f"[{source}#{i}]: {text}")
            citations.append(f"{source}#{i}")

        context = "\n\n".join(context_blocks)
        system_prompt = f"""{instructions}

        CRITICAL RULES:
        1. Answer the user's questions utilizing ONLY the following Context blocks.
        2. If the context does not contain the answer, politely state that you do not know based on the provided documents (do not invent or hallucinate answers).
        3. Always cite the exact source document name and its unique ID using the format [filename.ext#ID] for every piece of information used. Place the citation immediately after the relevant sentence. Never omit the brackets or the #ID part.

        Context:
        {context}
        """
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": query})
        return messages, citations, context_blocks

    async def stream_response(self, query: str, history: list, instructions: str, assistant_id: str):
        messages, citations, context_blocks = await self._build_messages(query, history, instructions, assistant_id)
        if messages is None:
            yield ("token", "Azure Search not configured.")
            yield ("done", [], [])
            return

        full_reply_parts = []
        stream = await self.openai_client.chat.completions.create(
            model=self.chat_deployment,
            messages=messages,
            temperature=0.2,
            max_tokens=800,
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            piece = getattr(delta, "content", None)
            if piece:
                full_reply_parts.append(piece)
                yield ("token", piece)

        full_reply = "".join(full_reply_parts)
        # Extract citations (anything inside brackets)
        found_cites = re.findall(r'\[([^\]]+)\]', full_reply)
        
        # Build map of granular citations AND base filenames
        normalized_granular = {c.lower(): c for c in citations}
        base_to_granular = {}
        for c in citations:
            base = c.split('#')[0].lower()
            if base not in base_to_granular: base_to_granular[base] = []
            base_to_granular[base].append(c)

        used_citations = []
        for fc in set(found_cites):
            fc_clean = fc.strip().lower()
            if fc_clean in normalized_granular:
                # Perfect granular match
                used_citations.append(normalized_granular[fc_clean])
            elif fc_clean in base_to_granular:
                # LLM cited base filename, fallback to including all chunks from that file
                used_citations.extend(base_to_granular[fc_clean])
        
        used_citations = list(set(used_citations)) # Deduplicate
        
        relevant_context = []
        for cite in used_citations:
            prefix = f"[{cite.lower()}]:"
            for block in context_blocks:
                if block.lower().startswith(prefix):
                    relevant_context.append(block)
        
        yield ("done", used_citations, relevant_context)
