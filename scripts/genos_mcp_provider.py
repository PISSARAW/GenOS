import sys
import json
import urllib.request
import argparse

def ingest_to_node(context_text, api_url="http://localhost:3000/api/memory/ingest"):
    """Envoie un bloc de texte pour l'ancrer definitivement dans la memoire SQLite avec son Embedding."""
    payload = json.dumps({"content": context_text, "category": "Conversation"}).encode('utf-8')
    req = urllib.request.Request(api_url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print("✅ Contexte ingere de facon permanente :", result)
    except Exception as e:
        print("❌ Erreur d'ingestion Node.js :", e)
        sys.exit(1)

def retrieve_from_node(query_text, api_url="http://localhost:3000/api/memory/vesicle"):
    """Demande a Node.js de faire un RAG et de creer une petite Vesicule avec le top 5."""
    payload = json.dumps({"query": query_text}).encode('utf-8')
    req = urllib.request.Request(api_url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print("✅ Evocation reussie, Vesicule concentree generee :", result)
    except Exception as e:
        print("❌ Erreur d'evocation Node.js :", e)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GenOS Biomimetic RAG Provider")
    parser.add_argument("--action", choices=["ingest", "retrieve"], required=True, help="Action a realiser")
    parser.add_argument("--file", help="Fichier contenant le texte (pour ingest)")
    parser.add_argument("--query", help="Question (pour retrieve)")
    parser.add_argument("--api-ingest", default="http://localhost:3000/api/memory/ingest")
    parser.add_argument("--api-retrieve", default="http://localhost:3000/api/memory/vesicle")
    
    args = parser.parse_args()
    
    if args.action == "ingest":
        if not args.file:
            print("❌ L'action ingest necessite --file")
            sys.exit(1)
        with open(args.file, 'r', encoding='utf-8') as f:
            content = f.read()
        print(f"🧠 Ingestion de {len(content)} caracteres...")
        ingest_to_node(content, args.api_ingest)
    elif args.action == "retrieve":
        if not args.query:
            print("❌ L'action retrieve necessite --query")
            sys.exit(1)
        print(f"🧠 Recherche des souvenirs pertinents pour : '{args.query}'...")
        retrieve_from_node(args.query, args.api_retrieve)
