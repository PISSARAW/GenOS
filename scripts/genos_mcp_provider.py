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

def ingest_to_genos(context_text):
    """Calcule l'embedding localement et appelle genos.exe pour insertion dans LadybugDB."""
    concept = context_text[:30].replace('"', '').replace("'", "").strip() + "..."
    emb = get_embedding(context_text)
    
    # Trouver le binaire genos.exe
    genos_path = os.path.join(os.path.dirname(__file__), "..", "target", "release", "genos.exe")
    if not os.path.exists(genos_path):
        genos_path = "genos" # Fallback to PATH
        
    cmd = [genos_path, "ingest", "--concept", concept, "--details", context_text, "--vector", json.dumps(emb)]
    
    try:
        subprocess.run(cmd, check=True)
        print("✅ Contexte ingere de facon permanente dans LadybugDB (via genos.exe)")
    except Exception as e:
        print("❌ Erreur d'ingestion genos.exe :", e)
        sys.exit(1)

def retrieve_from_node(query_text, hormone="normal", api_url="http://localhost:3000/api/memory/vesicle"):
    """Demande a Node.js de faire un RAG et de creer une petite Vesicule avec le top 5."""
    payload = json.dumps({"query": query_text, "hormone": hormone}).encode('utf-8')
    req = urllib.request.Request(api_url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f"✅ Evocation reussie (Hormone: {hormone}), Vesicule concentree generee :", result)
    except Exception as e:
        print("❌ Erreur d'evocation Node.js :", e)
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
        print(f"🧠 Recherche des souvenirs pertinents pour : '{args.query}' (Hormone: {args.hormone})...")
        retrieve_from_node(args.query, args.hormone, args.api_retrieve)
    elif args.action == "sleep":
        print(f"💤 Déclenchement de la phase de sommeil paradoxal (Consolidation et Apoptose)...")
        trigger_sleep(args.api_sleep)
