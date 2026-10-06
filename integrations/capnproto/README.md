# Sonde Cap'n Proto et MessagePack

Le crate isolé mesure la sérialisation d'une même charge binaire via une racine
`Data` Cap'n Proto empaquetée et un vecteur MessagePack. Il vérifie le
roundtrip, mais **ne compare pas des schémas typés équivalents** et ne justifie
aucune migration. Les durées dépendent fortement de la machine et du nombre
de répétitions ; le résultat n'est pas un gain produit.

`cargo test --manifest-path integrations/capnproto/Cargo.toml`

Une décision de protocole interne demanderait un schéma Cap'n Proto typé,
des bindings multi-langages, des charges représentatives et un profilage des
allocations. Les messages vers les LLM restent un sujet distinct.

Source : [Cap'n Proto](https://capnproto.org/).
