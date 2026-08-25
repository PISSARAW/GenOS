#!/bin/bash
git filter-branch -f --msg-filter '
    awk "
    NR==1 {
        if (match(\$0, /^(feat|fix|docs|chore|refactor|test|style|perf|build|ci)(\([^)]+\))?: *(.*)/, arr)) {
            rest = arr[3]
            gsub(/Protocole de test empirique/, \"Empirical test protocol\", rest)
            gsub(/pour les Concepts/, \"for Concepts\", rest)
            gsub(/ajout du Lot/, \"Add Lot\", rest)
            gsub(/concepts nouvellement impl??ment??s/, \"newly implemented concepts\", rest)
            gsub(/concepts nouvellement implémentés/, \"newly implemented concepts\", rest)
            gsub(/ajout des explications sur/, \"Add explanations on\", rest)
            gsub(/Int??gration de la validation empirique/, \"Integrate empirical validation\", rest)
            gsub(/Intégration de la validation empirique/, \"Integrate empirical validation\", rest)
            gsub(/et du protocole de test pour Agent IA/, \"and test protocol for AI Agent\", rest)
            first = toupper(substr(rest, 1, 1))
            \$0 = first substr(rest, 2)
        }
    }
    { print \$0 }
    "
' -- --all
