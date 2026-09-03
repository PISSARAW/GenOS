import os
import re

directories = ['crates/genos-core/src', 'crates/genos-core/tests']
fields = ['nervous_system', 'astrocyte', 'myelinator', 'microglia', 'ependymal', 'mind', 'cilia', 'vacuole', 'autonomic_ns', 'muscle']

for root, _, files in os.walk('crates/genos-core'):
    for file in files:
        if file.endswith('.rs'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()

            new_content = content
            # To avoid replacing inside struct definitions or function signatures, we can try to just replace gent.field or self.field if they are followed by nothing or ..
            # Wait, AgentCell definition itself shouldn't be touched (but we already rewrote mod.rs).
            if "src/cell/mod.rs" in path.replace('\\', '/'):
                continue
                
            for field in fields:
                # regex to replace \.field (but not followed by (, to avoid replacing nervous_system() -> nervous_system()())
                # also replacing \.field$ or \.field[^a-zA-Z0-9_]
                pattern = r'\.' + field + r'(?!\()'
                new_content = re.sub(pattern, '.' + field + '()', new_content)

            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
