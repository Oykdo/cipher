import re

# Lire le fichier
with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Supprimer tous les blocs /* ... */ multi-lignes
pattern = r'/\*.*?\*/'
content_cleaned = re.sub(pattern, '', content, flags=re.DOTALL)

# Supprimer les lignes "END OF COMMENTED" devenues orphelines
content_cleaned = re.sub(r'// END OF COMMENTED.*?\n', '', content_cleaned)

# Supprimer les lignes vides multiples consécutives (3+ lignes vides → 2 lignes vides)
content_cleaned = re.sub(r'\n\n\n+', '\n\n', content_cleaned)

# Écrire le fichier nettoyé
with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content_cleaned)

print('OK: Blocs commentes supprimes')
print(f'Lignes avant: {content.count(chr(10))}')
print(f'Lignes après: {content_cleaned.count(chr(10))}')
print(f'Réduction: {content.count(chr(10)) - content_cleaned.count(chr(10))} lignes')
