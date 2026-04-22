import re
with open('frontend/src/App.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

classes = re.findall(r'(?<!dark:)\b((?:bg|text|border|ring|placeholder|from|via|to)-(?:slate|gray|white|black|transparent)[a-zA-Z0-9/\-]*)\b', text)
print(set(classes))
