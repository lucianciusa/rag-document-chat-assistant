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
    'text-white': 'text-slate-900 dark:text-white',
    'prose-invert': 'dark:prose-invert',
    'prose-slate': 'prose-slate dark:prose-slate',
}

def process_class_string(cls_str):
    classes = cls_str.split()
    new_classes = []
    
    # Check if this context is inside a button that should always have text-white
    # We heuristically assume if there's bg-indigo or bg-red, text-white should stay text-white.
    is_colored_bg = any(c.startswith('bg-indigo-') or c.startswith('bg-red-') for c in classes)

    for c in classes:
        base = c
        opacity = ''
        if '/' in c and not c.startswith('/'):
            parts = c.split('/')
            base = parts[0]
            opacity = '/' + parts[1]
            
        if base in mapping:
            dark_variant = f"dark:{c}"
            if dark_variant not in classes:
                if base == 'text-white' and is_colored_bg:
                    new_classes.append(c)
                else:
                    light_class = mapping[base].split()[0]
                    new_classes.append(f"{light_class}{opacity}")
                    new_classes.append(dark_variant)
            else:
                new_classes.append(c)
        else:
            new_classes.append(c)
    return ' '.join(new_classes)

def repl_classname(match):
    prefix = match.group(1)
    cls_str = match.group(2)
    return f'{prefix}"{process_class_string(cls_str)}"'

def repl_className_expr(match):
    prefix = match.group(1)
    cls_str = match.group(2)
    return f'{prefix}`{process_class_string(cls_str)}`'

content = re.sub(r'(className\s*=\s*)"([^"]+)"', repl_classname, content)
content = re.sub(r'(className\s*=\s*)`([^`]+)`', repl_className_expr, content)

with open('frontend/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
