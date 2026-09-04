import sys
import json
import urllib.request
import argparse
import uuid
import time
import re

def get_embedding(text):
    payload = json.dumps({
        ""model"": ""nomic-embed-text"",
        ""prompt"": text
    }).encode('utf-8')
    req = urllib.request.Request(""http://localhost:11434/api/embeddings"", data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result.get(""embedding"", [0.0]*768)
    except Exception as e:
        print(""❌ Erreur Ollama Embeddings :"", e)
        return [0.0]*768

def extract_entities(text):
    system_prompt = ""You are a Named Entity Recognition (NER) system. \nAnalyze the user's text and extract entities and relationships.\nReturn a STRICT JSON list of relations matching this schema:\n[\n  {\n    \"entity_a\": \"Name of first entity\",\n    \"type_a\": \"Person | Object | Organization | Location\",\n    \"relation\": \"ACTION or RELATIONSHIP\",\n    \"entity_b\": \"Name of second entity\",\n    \"type_b\": \"Person | Object | Organization | Location\"\n  }\n]\nOutput ONLY the JSON list. No markdown blocks.""
    
    payload = json.dumps({
        ""model"": ""llama3.1:8b"",
        ""messages"": [
            {""role"": ""system"", ""content"": system_prompt},
            {""role"": ""user"", ""content"": text}
        ],
        ""temperature"": 0.0,
        ""format"": ""json""
    }).encode('utf-8')
    
    req = urllib.request.Request(""http://localhost:11434/api/chat"", data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            content = result[""message""][""content""]
            content = content.strip()
            if content.startswith(""`json""): content = content[7:]
            if content.startswith(""`""): content = content[3:]
            if content.endswith(""`""): content = content[:-3]
            relations = json.loads(content)
            return relations
    except Exception as e:
        print(""⚠️ Impossible d'extraire les entités via LLM :"", e)
        return []

def ingest_to_genos(context_text, speaker=""USER"", session_id=""session_1"", port=3030):
    chunk_id = f""chunk_{uuid.uuid4().hex[:8]}""
    timestamp = int(time.time())
    
    print(f""🧠 [NER] Extraction des entités pour le texte..."")
    relations = extract_entities(context_text)
    print(f""🕸️ [NER] {len(relations)} relation(s) trouvée(s)."")
    
    emb = get_embedding(context_text)
    
    payload_dict = {
        ""id"": chunk_id,
        ""text"": context_text,
        ""speaker"": speaker,
        ""timestamp"": timestamp,
        ""session_id"": session_id,
        ""vector"": emb,
        ""relations"": relations
    }
    
    payload = json.dumps(payload_dict).encode('utf-8')
    req = urllib.request.Request(f""http://127.0.0.1:{port}/api/ingest"", data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(""✅ Contexte ingéré dans l'Ontologie V4 via le daemon :"", result)
    except Exception as e:
        print(""❌ Erreur d'ingestion daemon :"", e)
        sys.exit(1)

def chat_with_daemon(query_text, port=3030):
    payload = json.dumps({""prompt"": query_text}).encode('utf-8')
    req = urllib.request.Request(f""http://127.0.0.1:{port}/api/chat"", data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f""🤖 [Agent GenOS] :\n{result.get('response', '')}"")
    except Exception as e:
        print(""❌ Erreur d'API avec le démon GenOS :"", e)
        sys.exit(1)

def trigger_sleep(api_url=""http://localhost:3000/api/memory/sleep""):
    req = urllib.request.Request(api_url, data=b""{}"", headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(""💤 Cycle de sommeil terminé :"", result)
    except Exception as e:
        print(""❌ Erreur lors du sommeil :"", e)
        sys.exit(1)

if __name__ == ""__main__"":
    parser = argparse.ArgumentParser(description=""GenOS Biomimetic RAG Provider"")
    parser.add_argument(""--action"", choices=[""ingest"", ""retrieve"", ""sleep""], required=True, help=""Action à réaliser"")
    parser.add_argument(""--file"", help=""Fichier contenant le texte (pour ingest)"")
    parser.add_argument(""--query"", help=""Question (pour retrieve)"")
    parser.add_argument(""--speaker"", default=""USER"", help=""Auteur du texte (pour ingest)"")
    parser.add_argument(""--session"", default=""default_session"", help=""ID de la session (pour ingest)"")
    parser.add_argument(""--hormone"", choices=[""normal"", ""dopamine"", ""adrenaline""], default=""normal"", help=""Etat neuromodulateur"")
    parser.add_argument(""--api-sleep"", default=""http://localhost:3030/api/memory/sleep"")
    
    args = parser.parse_args()
    
    if args.action == ""ingest"":
        if not args.file:
            print(""❌ L'action ingest nécessite --file"")
            sys.exit(1)
        with open(args.file, 'r', encoding='utf-8') as f:
            content = f.read()
        print(f""📥 Ingestion de {len(content)} caractères..."")
        ingest_to_genos(content, speaker=args.speaker, session_id=args.session)
    elif args.action == ""retrieve"":
        if not args.query:
            print(""❌ L'action retrieve nécessite --query"")
            sys.exit(1)
        print(f""🔍 Interrogation du démon pour : '{args.query}' ..."")
        chat_with_daemon(args.query)
    elif args.action == ""sleep"":
        print(f""💤 Déclenchement de la phase de sommeil paradoxal (Consolidation et Apoptose)..."")
        trigger_sleep(args.api_sleep)
