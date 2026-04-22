import re
with open('frontend/src/App.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix gradients
text = text.replace('from-slate-950', 'from-white dark:from-slate-950')
text = text.replace('via-slate-950/80', 'via-white/80 dark:via-slate-950/80')

# Fix placeholders
text = text.replace('placeholder-gray-400', 'placeholder-slate-500 dark:placeholder-gray-400')

# Fix gray-700
text = text.replace('bg-gray-700', 'bg-gray-200 dark:bg-gray-700')

# Fix modal bg
text = text.replace('bg-slate-50/60', 'bg-slate-50/60 dark:bg-slate-950/60')

# disabled bg
text = text.replace('disabled:bg-slate-200 dark:bg-slate-700', 'disabled:bg-slate-200 dark:disabled:bg-slate-700')
text = text.replace('disabled:bg-slate-700', 'disabled:bg-slate-200 dark:disabled:bg-slate-700')

# Let's also check if there are any `hover:bg-gray-700` that became `hover:bg-gray-200 dark:hover:bg-gray-700`
text = text.replace('hover:bg-gray-200 dark:bg-gray-700', 'hover:bg-gray-200 dark:hover:bg-gray-700')

with open('frontend/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
