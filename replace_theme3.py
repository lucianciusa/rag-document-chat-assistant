import re

with open('frontend/src/App.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

cleanup_map = {
    'bg-slate-50 dark:bg-slate-950': 'bg-slate-950',
    'bg-white dark:bg-slate-900': 'bg-slate-900',
    'bg-slate-100 dark:bg-slate-800': 'bg-slate-800',
    'bg-slate-200 dark:bg-slate-700': 'bg-slate-700',
    'border-slate-200 dark:border-slate-800': 'border-slate-800',
    'border-slate-200 dark:border-gray-800': 'border-gray-800',
    'border-slate-300 dark:border-slate-700': 'border-slate-700',
    'text-slate-800 dark:text-slate-200': 'text-slate-200',
    'text-slate-700 dark:text-slate-300': 'text-slate-300',
    'text-slate-600 dark:text-slate-400': 'text-slate-400',
    'text-slate-700 dark:text-gray-300': 'text-gray-300',
    'text-slate-800 dark:text-gray-200': 'text-gray-200',
    'text-slate-900 dark:text-white': 'text-white',
    'dark:prose-invert': 'prose-invert',
    'prose-slate dark:prose-slate': 'prose-slate',
    'bg-slate-50/50 dark:bg-slate-950/50': 'bg-slate-950/50',
    'border-slate-200/50 dark:border-slate-800/50': 'border-slate-800/50',
    'dark:hover:bg-slate-800': 'hover:bg-slate-800',
    'dark:hover:text-slate-300': 'hover:text-slate-300',
    'hover:bg-slate-200': '',
    'hover:text-slate-700': '',
    'dark:hover:bg-indigo-900/10': 'hover:bg-indigo-900/10',
    'dark:prose-pre:bg-slate-900': 'prose-pre:bg-slate-900',
    'dark:prose-pre:border-slate-800': 'prose-pre:border-slate-800',
    'bg-white dark:prose-pre:bg-slate-900': 'prose-pre:bg-slate-900',
    'prose-pre:bg-white dark:prose-pre:bg-slate-900': 'prose-pre:bg-slate-900',
    'prose-pre:border-slate-200 dark:prose-pre:border-slate-800': 'prose-pre:border-slate-800',
}

for k, v in cleanup_map.items():
    text = text.replace(k, v)

# Also clear any remaining dark: classes
text = re.sub(r'dark:([a-zA-Z0-9\-]+(?:/\d+)?)', r'\1', text)
text = text.replace('prose-invert prose-invert', 'prose-invert')
text = text.replace('bg-slate-50 bg-slate-950', 'bg-slate-950')
text = text.replace('bg-white bg-slate-900', 'bg-slate-900')

dark_to_light = {
    'bg-slate-950': 'bg-slate-50',
    'bg-slate-900': 'bg-white',
    'bg-slate-800': 'bg-slate-100',
    'bg-slate-700': 'bg-slate-200',
    'border-slate-800': 'border-slate-200',
    'border-gray-800': 'border-slate-200',
    'border-slate-700': 'border-slate-300',
    'text-slate-200': 'text-slate-800',
    'text-slate-300': 'text-slate-700',
    'text-slate-400': 'text-slate-600',
    'text-gray-300': 'text-slate-700',
    'text-gray-200': 'text-slate-800',
    'text-gray-400': 'text-slate-600',
    'text-white': 'text-slate-900',
    'prose-invert': '', 
    'prose-slate': 'prose-slate',
    'hover:bg-slate-800': 'hover:bg-slate-200',
    'hover:text-slate-300': 'hover:text-slate-700',
    'hover:bg-gray-700': 'hover:bg-slate-200',
    'hover:text-gray-200': 'hover:text-slate-800',
    'hover:text-white': 'hover:text-slate-900',
    'prose-pre:bg-slate-900': 'prose-pre:bg-slate-50',
    'prose-pre:border-slate-800': 'prose-pre:border-slate-200',
}

def replace_classes(match):
    cls_str = match.group(0)
    classes = cls_str.split()
    new_classes = []
    
    is_button = 'bg-indigo-600' in classes or 'bg-red-600' in classes
    
    for c in classes:
        base = c
        prefix = ''
        if ':' in c:
            parts = c.split(':')
            prefix = parts[0] + ':'
            base = parts[1]
            
        opacity = ''
        if '/' in base:
            parts = base.split('/')
            base = parts[0]
            opacity = '/' + parts[1]
            
        full_base = prefix + base
        if full_base == 'text-white' and is_button:
            new_classes.append(c)
            continue
            
        if full_base in dark_to_light:
            light_val = dark_to_light[full_base]
            if light_val == '':
                # e.g., prose-invert becomes dark:prose-invert
                new_classes.append(f"dark:{c}")
            else:
                new_classes.append(f"{light_val}{opacity} dark:{c}")
        else:
            new_classes.append(c)
            
    return ' '.join(new_classes)

# We will apply this to all class names.
# A regex to match class strings: className="..." or className={'...'} or className={`...`}
# To be robust, we'll extract the string parts and pass them to replace_classes.

def string_replacer(match):
    before = match.group(1)
    string_content = match.group(2)
    after = match.group(3)
    # We only want to replace words that look like tailwind classes.
    # Actually, applying replace_classes on the whole string content works since it splits by space.
    return before + replace_classes(match) + after

# Wait, `replace_classes(match)` above expects the match to be the string content itself.
# Let's just use a regex for words!

def word_replacer(match):
    c = match.group(0)
    # determine context by looking backwards to see if we are inside a button... too hard.
    # Let's just use the fact that buttons have text-white
    return c # placeholder

# Alternative approach:
# Split the entire text into tokens (words and non-words).
tokens = re.split(r'([\s"\'`{}])', text)
new_tokens = []
in_class_attr = False
is_colored_button = False

# We need a window to know if we are inside a tag with bg-indigo-600
# It's better to just regex replace and then manually fix the buttons.
new_text = text
for d, l in dark_to_light.items():
    if d == 'text-white': continue # handle specially
    
    if l == '':
        # prose-invert -> dark:prose-invert
        pattern = r'(?<!dark:)\b' + re.escape(d) + r'\b'
        new_text = re.sub(pattern, f"dark:{d}", new_text)
    else:
        # replace d[/op] with l[/op] dark:d[/op]
        # watch out for colons in d (like hover:bg-slate-800)
        # re.escape handles colons.
        pattern = r'(?<!dark:)\b' + re.escape(d) + r'(?:/(\d+))?\b'
        def r_fn(m, light=l, dark=d):
            op = '/' + m.group(1) if m.group(1) else ''
            return f"{light}{op} dark:{dark}{op}"
        new_text = re.sub(pattern, r_fn, new_text)

# Handle text-white
def text_white_replacer(m):
    return "text-slate-900 dark:text-white"
new_text = re.sub(r'(?<!dark:)\btext-white\b', text_white_replacer, new_text)

# Fix colored buttons
new_text = new_text.replace("bg-indigo-600 text-slate-900 dark:text-white", "bg-indigo-600 text-white")
new_text = new_text.replace("bg-red-600 text-slate-900 dark:text-white", "bg-red-600 text-white")
new_text = new_text.replace("bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white", "bg-indigo-600 hover:bg-indigo-500 text-white")

# Also 'text-white' in header Nexus AI
new_text = new_text.replace("text-lg font-bold text-slate-900 dark:text-white", "text-lg font-bold text-slate-900 dark:text-white")

with open('frontend/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(new_text)

