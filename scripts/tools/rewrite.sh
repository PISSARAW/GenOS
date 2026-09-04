#!/bin/bash
git filter-branch -f --msg-filter '
  read -r msg
  new_msg="$msg"
  
  if [[ "$msg" == "refactor(agent): Apply SRP by isolating ImmuneSystem"* ]]; then
    new_msg="[MITOSE] Application du SRP en isolant ImmuneSystem"
  elif [[ "$msg" == "refactor(agent): Apply SRP by isolating GeneticSystem"* ]]; then
    new_msg="[MITOSE] Application du SRP en isolant GeneticSystem"
  elif [[ "$msg" == "refactor(agent): Apply SRP by isolating MetabolicSystem"* ]]; then
    new_msg="[MITOSE] Application du SRP en isolant MetabolicSystem"
  elif [[ "$msg" == "test(orchestrator): Update tests to match new SRP Orchestrator fields"* ]]; then
    new_msg="[IMMUNITE] Mise a jour des tests suite a la separation SRP"
  elif [[ "$msg" == "refactor(orchestrator): Apply SRP by isolating systems (Immune, Endocrine, Nervous)"* ]]; then
    new_msg="[MITOSE] Application du SRP sur Orchestrator (Immune, Endocrine, Nervous)"
  elif [[ "$msg" == "chore(orchestrator): Fix UTF-8 encoding in comments"* ]]; then
    new_msg="[MUTATION] Correction de l encodage UTF-8 dans les commentaires"
  elif [[ "$msg" == "feat(agent): Introduce AgentCellBuilder for explicit construction"* ]]; then
    new_msg="[EVOLUTION] Ajout du constructeur AgentCellBuilder"
  elif [[ "$msg" == "refactor(agent): Implement OCP via Specialization Enum"* ]]; then
    new_msg="[MITOSE] Implementation du OCP via Specialization"
  elif [[ "$msg" == "refactor(agent): Extract all cognitive fields into a Mind substruct"* ]]; then
    new_msg="[MITOSE] Extraction des champs cognitifs dans Mind"
  elif [[ "$msg" == "fix(ribosome): fallback to logic model instead of heavy to avoid region block"* ]]; then
    new_msg="[MUTATION] Fallback vers logic model (evite blocage de region)"
  fi
  
  echo "$new_msg"
' HEAD~10..HEAD
