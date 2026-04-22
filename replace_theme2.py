import re

with open('frontend/src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

mapping = {
    'bg-slate-950': 'bg-slate-50 dark:bg-slate-950',
    'bg-slate-900': 'bg-white dark:bg-slate-900',
    'bg-slate-800': 'bg-slate-100 dark:bg-slate-800',
    'bg-slate-700': 'bg-slate-200 dark:bg-slate-700',
    'border-slate-800': 'border-slate-200 dark:border-slate-800',
    'border-gray-800': 'border-slate-200 dark:border-slate-800',
    'border-slate-700': 'border-slate-300 dark:border-slate-700',
    'text-slate-200': 'text-slate-800 dark:text-slate-200',
    'text-slate-300': 'text-slate-700 dark:text-slate-300',
    'text-slate-400': 'text-slate-500 dark:text-slate-400',
    'text-gray-300': 'text-slate-700 dark:text-gray-300',
    'text-gray-200': 'text-slate-800 dark:text-gray-200',
    'prose-invert': 'dark:prose-invert',
    'prose-slate': 'prose-slate dark:prose-slate',
}

new_content = content
for base, replacement in mapping.items():
    light_cls = replacement.split()[0]
    dark_cls = replacement.split()[1]
    
    # Regex to find base[/opacity] and replace with light[/opacity] dark:base[/opacity]
    # Negative lookbehind to avoid dark:base
    # Also ignore if already processed (though our python script might run twice if we are not careful)
    pattern = r'(?<!dark:)\b' + re.escape(base) + r'(?:/(\d+))?\b'
    
    def r_fn(m):
        opacity = '/' + m.group(1) if m.group(1) else ''
        return f"{light_cls}{opacity} {dark_cls}{opacity}"
        
    new_content = re.sub(pattern, r_fn, new_content)

# Fix text-white
def rw_fn(m):
    return "text-slate-900 dark:text-white"
new_content = re.sub(r'(?<!dark:)\btext-white\b', rw_fn, new_content)

# Fix buttons manually to text-white instead of text-slate-900
new_content = new_content.replace("bg-indigo-600 text-slate-900 dark:text-white", "bg-indigo-600 text-white")
new_content = new_content.replace("bg-red-600 text-slate-900 dark:text-white", "bg-red-600 text-white")

with open('frontend/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
