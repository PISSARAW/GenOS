import sys
import json
import urllib.request
import argparse

import subprocess
import os

def get_embedding(text):
    payload = json.dumps({
        "model": "nomic-embed-text",
        "prompt": text
    }).encode('utf-8')
    req = urllib.request.Request("http://localhost:11434/api/embeddings", data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result.get("embedding", [0.0]*768)
    except Exception as e:
        print("❌ Erreur Ollama :", e)
        return [0.0]*768

def ingest_to_genos(context_text, port=3030):
    """Calcule l'embedding localement et l'envoie au daemon genos.exe."""
    concept = context_text[:30].replace('"', '').replace("'", "").strip() + "..."
    emb = get_embedding(context_text)
    
    payload = json.dumps({
        "concept": concept,
        "details": context_text,
        "vector": emb
    }).encode('utf-8')
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/ingest", data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print("✅ Contexte ingéré dans LadybugDB via le daemon :", result)
    except Exception as e:
        print("❌ Erreur d'ingestion daemon :", e)
        sys.exit(1)

def chat_with_daemon(query_text, port=3030):
    """Demande au démon GenOS (Rust) d'effectuer un RAG hybride et de répondre à la question."""
    payload = json.dumps({"prompt": query_text}).encode('utf-8')
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/chat", data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f"✅ [Agent GenOS] :\n{result.get('response', '')}")
    except Exception as e:
        print("❌ Erreur d'API avec le démon GenOS :", e)
        sys.exit(1)

def trigger_sleep(api_url="http://localhost:3000/api/memory/sleep"):
    """Declenche un cycle de sommeil (Dépression à long terme et apoptose)"""
    req = urllib.request.Request(api_url, data=b"{}", headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print("💤 Cycle de sommeil termine :", result)
    except Exception as e:
        print("❌ Erreur lors du sommeil :", e)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GenOS Biomimetic RAG Provider")
    parser.add_argument("--action", choices=["ingest", "retrieve", "sleep"], required=True, help="Action a realiser")
    parser.add_argument("--file", help="Fichier contenant le texte (pour ingest)")
    parser.add_argument("--query", help="Question (pour retrieve)")
    parser.add_argument("--hormone", choices=["normal", "dopamine", "adrenaline"], default="normal", help="Etat neuromodulateur")
    parser.add_argument("--api-ingest", default="http://localhost:3000/api/memory/ingest")
    parser.add_argument("--api-retrieve", default="http://localhost:3000/api/memory/vesicle")
    parser.add_argument("--api-sleep", default="http://localhost:3000/api/memory/sleep")
    
    args = parser.parse_args()
    
    if args.action == "ingest":
        if not args.file:
            print("❌ L'action ingest necessite --file")
            sys.exit(1)
        with open(args.file, 'r', encoding='utf-8') as f:
            content = f.read()
        print(f"🧠 Ingestion de {len(content)} caracteres...")
        ingest_to_genos(content)
    elif args.action == "retrieve":
        if not args.query:
            print("❌ L'action retrieve necessite --query")
            sys.exit(1)
        print(f"🧠 Interrogation du démon pour : '{args.query}' ...")
        chat_with_daemon(args.query)
    elif args.action == "sleep":
        print(f"💤 Déclenchement de la phase de sommeil paradoxal (Consolidation et Apoptose)...")
        trigger_sleep(args.api_sleep)
