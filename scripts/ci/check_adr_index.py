# -*- coding: utf-8 -*-
"""Garde l'index des ADR synchronise avec les fichiers de docs/adr/.

Verifie que chaque ADR est indexe exactement une fois dans
docs/adr/README.md et que les numeros partages sont desambigues
par suffixe (0063a, 0063b, ...) dans l'ordre des slugs.

Les fichiers ne sont jamais renommes (chemins scelles, ADR 0005) ;
seul l'index porte la desambiguation. Usage :
    python scripts/ci/check_adr_index.py            # controle
    python scripts/ci/check_adr_index.py --update   # regenere le tableau
"""
import os
import re
import sys

ROOT = os.path.abspath(os.getcwd())
ADR_DIR = os.path.join(ROOT, "docs", "adr")
README = os.path.join(ADR_DIR, "README.md")

ROW_RE = re.compile(r"^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|(.*)$")
NUM_RE = re.compile(r"^(\d{4}|003x)-.+\.md$")
TITLE_CLEAN_RE = re.compile(r"^(ADR\s+\d{3,4}x?\s*[\-\u2013\u2014:]\s*|\d{3,4}\s*[\-\u2013\u2014:]\s*)")
FIELD_RES = {
    "status": re.compile(r"\*\*Statut\*\*\s*:\s*(.+)$", re.M),
    "date": re.compile(r"\*\*Date\*\*\s*:\s*(.+)$", re.M),
    "domain": re.compile(r"\*\*Domaine\*\*\s*:\s*(.+)$", re.M),
}
TITLE_RE = re.compile(r"^#\s+(.+)$", re.M)

COLLISION_NOTE = (
    "> **Identifiants numériques partagés** : certains numéros sont portés par\n"
    "> plusieurs fichiers, en plus de `003x` (format historique gelé). Les\n"
    "> fichiers sont conservés tels quels (renommage interdit sans migration\n"
    "> de provenance, ADR 0005) ; l'index les distingue par suffixe (`0063a`,\n"
    "> `0063b`, …). Vérifié par `python scripts/ci/check_adr_index.py`.\n"
)

NOTE_MARKERS = (
    "Collision numérique `0154`",
    "Identifiants numériques partagés",
    "Identifiants numeriques partages",
)


def adr_files():
    """Liste les fichiers ADR tries (hors README)."""
    names = sorted(
        name
        for name in os.listdir(ADR_DIR)
        if name.endswith(".md") and name != "README.md"
    )
    return names


def number_of(name):
    """Prefixe numerique d'un fichier ADR (003x pour le cas historique)."""
    if name.startswith("003x-"):
        return "003x"
    return name[:4]


def expected_labels(names):
    """Calcule le label d'index attendu pour chaque fichier."""
    labels = {}
    groups = {}
    for name in names:
        groups.setdefault(number_of(name), []).append(name)
    for number in groups:
        members = sorted(groups[number])
        if len(members) == 1:
            labels[members[0]] = number
        else:
            for rank, member in enumerate(members):
                labels[member] = number + chr(ord("a") + rank)
    return labels


def read_index_rows(text):
    """Extrait les lignes du tableau d'index (label, fichier, cellules)."""
    rows = []
    for line in text.splitlines():
        match = ROW_RE.match(line)
        if match:
            cells = [cell.strip() for cell in match.group(3).split("|")]
            rows.append((match.group(1), match.group(2), cells[:4]))
    return rows


def check_names(names):
    """Signale les fichiers hors format NNNN-slug.md (003x grandfatherise)."""
    problems = []
    for name in names:
        if not NUM_RE.match(name):
            problems.append("BADNAME " + name)
    return problems


def check_index(names, rows):
    """Compare fichiers presents et entrees d'index."""
    problems = check_names(names)
    labels = expected_labels(names)
    seen = {}
    for label, target, _cells in rows:
        seen[target] = seen.get(target, 0) + 1
        if target not in labels:
            problems.append("DANGLING " + target)
        elif label != labels[target]:
            problems.append(
                "LABEL %s should be %s (%s)" % (target, labels[target], label)
            )
    for name in names:
        if name not in seen:
            problems.append("MISSING " + name)
        elif seen[name] > 1:
            problems.append("DUPLICATE " + name)
    return problems


def clean_title(raw):
    """Retire le prefixe 'ADR NNNN -' du titre du fichier."""
    return TITLE_CLEAN_RE.sub("", raw.strip())


def generated_row(name):
    """Construit une ligne d'index depuis l'en-tete du fichier."""
    text = open(os.path.join(ADR_DIR, name), encoding="utf-8").read()
    title = TITLE_RE.search(text)
    fields = {}
    for key in FIELD_RES:
        match = FIELD_RES[key].search(text)
        fields[key] = match.group(1).strip() if match else ""
    if not fields["status"]:
        section = re.search(r"^##\s+Statut\s*$", text, re.M)
        if section:
            tail = text[section.end():].split("##", 1)[0]
            fields["status"] = " ".join(tail.split())[:80]
    return [
        clean_title(title.group(1)) if title else name,
        fields["status"] or "Voir le fichier",
        fields["date"] or "--",
        fields["domain"] or "--",
    ]


def render_row(label, name, cells):
    """Formate une ligne du tableau d'index."""
    padded = list(cells) + ["--"] * (4 - len(cells))
    return "| [%s](%s) | %s |" % (label, name, " | ".join(padded[:4]))


def rebuild_table(names, rows):
    """Regenere le tableau trie (lignes existantes conservees, labels fixes)."""
    labels = expected_labels(names)
    known = {}
    for _label, target, cells in rows:
        if target not in known:
            known[target] = cells
    table = ["| N° | Titre | Statut | Date | Domaine |",
             "| --- | --- | --- | --- | --- |"]
    for name in sorted(names, key=lambda n: (number_of(n), n)):
        cells = known.get(name) or generated_row(name)
        table.append(render_row(labels[name], name, cells))
    return table


def replace_table(text, table):
    """Remplace tout le tableau d'index (meme coupe en blocs) dans le README."""
    lines = text.splitlines()
    start = next(
        index for index, line in enumerate(lines) if line.startswith("## Index")
    )
    end = next(
        (index for index in range(start + 1, len(lines))
         if lines[index].startswith("## ")),
        len(lines),
    )
    kept = [
        line for line in lines[start + 1:end]
        if not line.startswith("|") and line.strip()
    ]
    region = ["## Index", ""] + table + [""] + kept
    return "\n".join(lines[:start] + region + lines[end:]) + "\n"


def replace_collision_note(text):
    """Remplace l'ancienne note 0154 par la note generale."""
    lines = text.splitlines()
    start = next(
        (index for index, line in enumerate(lines)
         if any(marker in line for marker in NOTE_MARKERS)),
        None,
    )
    if start is None:
        marker = "## Cycle de vie"
        insert = next(
            index for index, line in enumerate(lines) if line.startswith(marker)
        )
        head = lines[:insert]
        if head and head[-1].strip():
            head.append("")
        return "\n".join(head + [COLLISION_NOTE.rstrip(), ""] + lines[insert:]) + "\n"
    end = start
    while end < len(lines) and lines[end].startswith(">"):
        end += 1
    return "\n".join(lines[:start] + [COLLISION_NOTE.rstrip()] + lines[end:]) + "\n"


def main():
    """Controle ou regenere l'index des ADR."""
    names = adr_files()
    text = open(README, encoding="utf-8").read()
    rows = read_index_rows(text)
    problems = check_index(names, rows)
    if "--update" in sys.argv:
        updated = replace_collision_note(replace_table(text, rebuild_table(names, rows)))
        open(README, "w", encoding="utf-8").write(updated)
        print("ADR index updated: %d files." % len(names))
        return 0
    for problem in problems:
        print("REJECT " + problem)
    print("ADR index: %d files, %d rows, %d problems."
          % (len(names), len(rows), len(problems)))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
