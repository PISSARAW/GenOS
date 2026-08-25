# 24. IMMUNOLOGIE AVANCÉE

Ce document regroupe les concepts immunologiques récemment implémentés : Vaccination, Interférons et SAR (Systemic Acquired Resistance).

---

## 24.1 Vaccination & Mémoire Immunitaire

### Ce que ça apporte à l'agent
GenOS peut simuler l'injection d'un "virus atténué" (un prompt malveillant affaibli ou inactif) lors de l'entraînement ou du cycle de vie de l'agent. Le système immunitaire de l'agent l'analyse, l'enregistre dans son "Registre de Mémoire Immunitaire" et crée des anticorps (heuristiques de rejet).
Cela apporte **une immunité proactive**. L'agent n'a pas besoin de mourir d'une attaque pour apprendre à s'en défendre.

---

## 24.2 Interférons

### Ce que ça apporte à l'agent
Quand une cellule biologique est infectée, elle sécrète des interférons : des signaux d'alarme qui disent aux cellules voisines "renforcez vos parois, un virus est là".
Dans GenOS, si un Agent A subit une attaque (ex: une tentative de Jailbreak), il émet un Interféron sur le réseau (Gossip Node). Les Agents B, C et D, qui reçoivent le signal, augmentent instantanément la sévérité de leurs filtres de sécurité et de leurs Checkpoints, avant même de croiser l'attaquant.
Cela apporte **une défense collective instantanée**.

### Schéma Conceptuel (Interférons)
`mermaid
sequenceDiagram
    participant Attaquant
    participant Agent A (Infecté)
    participant Agent B (Sain)
    
    Attaquant->>Agent A: Injection Prompt Malveillant
    Agent A->>Agent A: Détecte l'infection (Nocicepteur)
    Agent A->>Agent B: Émission d'Interférons (Réseau)
    Agent B->>Agent B: Condense sa chromatine (Mode Paranoïa)
    Attaquant->>Agent B: Injection Prompt Malveillant
    Agent B-->>Attaquant: Rejet Immédiat O(1)
`

---

## 24.3 SAR Héritable (Systemic Acquired Resistance)

### Ce que ça apporte à l'agent
Concept très présent chez les plantes. Une attaque sur une feuille rend l'ensemble de la plante résistante, et cette résistance peut être transmise aux graines.
Dans GenOS (sar.rs), une résistance acquise par l'essaim modifie durablement le phénotype des générations futures (héritage épigénétique Lamarckien). L'immunité n'est plus juste une mise en cache temporaire, elle devient structurelle.
