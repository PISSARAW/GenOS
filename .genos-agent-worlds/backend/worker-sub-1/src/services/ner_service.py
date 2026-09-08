from fastapi import FastAPI
from pydantic import BaseModel
from gliner import GLiNER
import json

app = FastAPI()
# Load the GLiNER model (small and extremely fast for NER)
model = GLiNER.from_pretrained("urchade/gliner_medium-v2.1")
labels = ["Person", "Organization", "Location", "Object", "Technology", "Action", "Topic"]

class NERRequest(BaseModel):
    text: str

@app.get("/")
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "gliner_ner",
        "labels": labels,
        "model": "urchade/gliner_medium-v2.1"
    }

@app.post("/extract")
async def extract_entities(req: NERRequest):
    entities = model.predict_entities(req.text, labels)
    
    # Simple rule-based relation builder for the graph
    # GLiNER extracts entities, we will pair them up as related
    relations = []
    
    # We take the first Action or Topic as the relationship, otherwise default to RELATED_TO
    action = "RELATED_TO"
    for e in entities:
        if e["label"] == "Action":
            action = e["text"].upper().replace(" ", "_")
            
    # Pair up entities
    valid_entities = [e for e in entities if e["label"] != "Action"]
    
    if len(valid_entities) >= 2:
        for i in range(len(valid_entities) - 1):
            relations.append({
                "entity_a": valid_entities[i]["text"],
                "type_a": valid_entities[i]["label"],
                "relation": action,
                "entity_b": valid_entities[i+1]["text"],
                "type_b": valid_entities[i+1]["label"]
            })
    elif len(valid_entities) == 1:
        # Relate to the main topic or speaker if needed, but for now we skip single entities
        pass
        
    return {"relations": relations}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
