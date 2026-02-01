import sys

file_path = r'd:\shptutupan\frontend\src\MainLayout.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line numbers in view_file are 1-indexed.
# We want to remove lines 469 to 523 (inclusive).
# In 0-indexed list, this is index 468 to 522.
# We also want to remove the comment at line 222 (index 221).
# And the comment at line 2260 (index 2259).

# Note: Indices will shift as we remove lines. Let's remove from end to beginning.
indices_to_remove = list(range(468, 523))
indices_to_remove.append(221)
indices_to_remove.append(2259)

indices_to_remove.sort(reverse=True)

for i in indices_to_remove:
    if i < len(lines):
        del lines[i]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
