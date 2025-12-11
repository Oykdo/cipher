# 🚀 Démarrer le Demo P2P - Guide Ultra-Rapide

## ⚡ Quick Start (5 minutes)

### Étape 1: Démarrer les serveurs (2 terminaux)

**Terminal 1 - Backend:**
```bash
cd apps/bridge
npm run dev
```

Attendre: `✅ P2P Signaling server configured`

**Terminal 2 - Frontend:**
```bash
cd apps/frontend
npm run dev
```

Attendre: `Local: http://localhost:5173`

---

### Étape 2: Ouvrir deux navigateurs

**Navigateur 1 (Chrome):**
1. Ouvrir `http://localhost:5173`
2. Login: `alice` / phrase mnémonique
3. Aller sur `/p2p-demo`

**Navigateur 2 (Firefox ou Chrome Incognito):**
1. Ouvrir `http://localhost:5173`
2. Login: `bob` / phrase mnémonique
3. Aller sur `/p2p-demo`

---

### Étape 3: Tester !

1. Les deux navigateurs devraient afficher "● Connected"
2. Taper un message dans le navigateur 1
3. Cliquer "Send"
4. **Le message apparaît instantanément dans le navigateur 2 !**

---

## 🔍 Vérification P2P

### Console (F12)
Chercher ces logs :
```
✅ [P2P] Connected to peer
📤 [P2P] Sent message
📨 [P2P] Received message
```

### Network Tab
- Envoyer un message
- **Vérifier:** Aucune requête HTTP vers `/api/v2/messages`
- **Seul:** WebSocket pour signaling initial

### WebRTC Internals
Chrome: `chrome://webrtc-internals/`
- Vérifier: Data Channel ouvert
- Vérifier: Connexion directe (pas de relay)

---

## 🐛 Problèmes Courants

### "Waiting for peer to connect..."
**Solution:** Vérifier que les deux utilisateurs sont différents

### "Connection failed"
**Solution:** Rafraîchir les deux navigateurs

### Messages ne s'affichent pas
**Solution:** Vérifier la console pour erreurs

---

## 📚 Documentation Complète

- **Guide complet:** `P2P_POC_README.md`
- **Architecture:** `P2P_ARCHITECTURE.md`
- **Implémentation:** `P2P_IMPLEMENTATION_COMPLETE.md`

---

## 🎉 C'est tout !

Vous avez maintenant une messagerie **vraiment P2P** où les messages ne passent **jamais** par le serveur !

**Amusez-vous bien !** 🚀
