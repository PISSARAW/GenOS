import os
import re

fields = ['nervous_system', 'astrocyte', 'myelinator', 'microglia', 'ependymal', 'mind', 'cilia', 'vacuole', 'autonomic_ns', 'muscle']

for root, _, files in os.walk('crates/genos-core'):
    for file in files:
        if file.endswith('.rs') and file != 'mod.rs':
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()

            new_content = content
            for field in fields:
                # We want to match .field not followed by (
                # Be careful with gent.muscle_mut() -> if field is muscle, .muscle_mut has .muscle!
                # We need to match .field followed by non-alphanumeric (like space, comma, newline, })
                pattern = r'\.' + field + r'(?=[^a-zA-Z0-9_\(])'
                new_content = re.sub(pattern, '.' + field + '()', new_content)

            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
