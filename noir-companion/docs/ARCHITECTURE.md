# Noir Companion App — Architecture & Strategy

## Vue d'ensemble

Noir Companion est une app mobile (iOS d'abord, Android en v2) qui permet de
contrôler le player audio Noir tournant sur macOS. Le Mac fait office de
**serveur** ; le mobile est un **client distant** sur le réseau local.

```
┌─────────────────┐          WebSocket / mDNS         ┌──────────────────┐
│   Noir Desktop  │◄────────────────────────────────►  │  Noir Companion  │
│   (macOS)       │        réseau local (LAN)          │  (iOS / Android) │
│                 │                                     │                  │
│  ┌───────────┐  │                                     │  ┌────────────┐ │
│  │ Player    │  │   ◄── play/pause/seek/skip ──       │  │ Remote UI  │ │
│  │ Engine    │  │   ── state/progress/track ──►       │  │ Controller │ │
│  ├───────────┤  │                                     │  ├────────────┤ │
│  │ Library   │  │   ◄── search/browse ──              │  │ Library    │ │
│  │ Index     │  │   ── results/metadata ──►           │  │ Browser    │ │
│  ├───────────┤  │                                     │  ├────────────┤ │
│  │ WebSocket │  │                                     │  │ WebSocket  │ │
│  │ Server    │  │                                     │  │ Client     │ │
│  ├───────────┤  │                                     │  ├────────────┤ │
│  │ mDNS      │  │   ◄── discovery (Bonjour) ──       │  │ mDNS       │ │
│  │ Advertiser│  │                                     │  │ Browser    │ │
│  └───────────┘  │                                     │  └────────────┘ │
└─────────────────┘                                     └──────────────────┘
```

---

## 1. Stratégie technologique

### Pourquoi ces choix

| Composant | Technologie | Justification |
|-----------|------------|---------------|
| **Protocole réseau** | WebSocket (JSON) | Bidirectionnel, temps réel, natif sur toutes les plateformes |
| **Découverte réseau** | mDNS / Bonjour | Zero-config, natif sur Apple, dispo sur Android via NsdManager |
| **Serveur desktop** | Swift Package (intégré à Noir) | Même langage que l'app macOS, accès direct au player |
| **iOS app** | SwiftUI + Swift Concurrency | Natif, performant, bon support Apple ecosystem |
| **Android (v2)** | Kotlin + Jetpack Compose | Équivalent natif Android, réutilise le protocole JSON |
| **Sérialisation** | JSON (Codable) | Simple, debuggable, suffisant pour le volume de données |

### Pourquoi PAS ces alternatives

| Alternative | Raison du rejet |
|-------------|----------------|
| REST API | Pas de push serveur→client (état du player), polling = latence |
| gRPC/Protobuf | Over-engineered pour du LAN, complexifie le debug |
| Bluetooth | Portée limitée, débit faible pour transférer métadonnées/artwork |
| CloudKit/Firebase | Nécessite internet, latence, coût — on veut du LAN pur |
| React Native/Flutter | Surcoût runtime, accès mDNS complexe, 2 apps natives = mieux |

---

## 2. Architecture détaillée

### 2.1 Découverte réseau (Pairing)

```
Séquence de connexion :

1. Noir Desktop démarre → publie un service mDNS :
   Service type : _noir-player._tcp
   Port : 9845
   TXT records : { "version": "1", "name": "MacBook de Thomas" }

2. Noir Companion (iOS) scanne les services _noir-player._tcp

3. L'utilisateur tape sur le Mac découvert → connexion WebSocket :
   ws://<ip>:9845/ws

4. Handshake d'authentification :
   Client envoie : { "type": "auth", "deviceName": "iPhone de Thomas" }
   Server répond : { "type": "auth_ok", "serverName": "MacBook de Thomas" }

5. Le serveur push l'état initial du player + la library summary
```

**Sécurité LAN :** En MVP, on fait confiance au réseau local (pas de TLS).
En v2, on peut ajouter un code PIN affiché sur le Mac pour valider le pairing.

### 2.2 Protocole de messages (WebSocket JSON)

Tous les messages suivent cette enveloppe :

```json
{
  "type": "string",
  "id": "uuid (optionnel, pour request/response)",
  "payload": { }
}
```

#### Messages Client → Serveur (commandes)

| Type | Payload | Description |
|------|---------|-------------|
| `auth` | `{ deviceName }` | Authentification initiale |
| `player.play` | `{ trackId }` | Lancer une track |
| `player.pause` | `{}` | Pause |
| `player.resume` | `{}` | Reprendre |
| `player.seek` | `{ position: Float }` | Seek (en secondes) |
| `player.skip_next` | `{}` | Track suivante |
| `player.skip_prev` | `{}` | Track précédente |
| `player.set_volume` | `{ volume: Float }` | Volume 0.0–1.0 |
| `library.search` | `{ query, limit? }` | Recherche dans la library |
| `library.browse` | `{ category, offset?, limit? }` | Parcourir (artists, albums, tracks) |
| `library.get_album` | `{ albumId }` | Détail d'un album |
| `library.get_artist` | `{ artistId }` | Détail d'un artiste |
| `favorites.add` | `{ trackId }` | Ajouter aux favoris |
| `favorites.remove` | `{ trackId }` | Retirer des favoris |
| `favorites.list` | `{ offset?, limit? }` | Lister les favoris |

#### Messages Serveur → Client (état & réponses)

| Type | Payload | Description |
|------|---------|-------------|
| `auth_ok` | `{ serverName, libraryStats }` | Auth réussie |
| `player.state` | `{ state, track, position, duration, volume }` | État complet du player (push) |
| `player.progress` | `{ position }` | Position courante (push toutes les 1s) |
| `library.results` | `{ items[], total, offset }` | Résultats de recherche/browse |
| `library.album` | `{ album, tracks[] }` | Détail album |
| `library.artist` | `{ artist, albums[] }` | Détail artiste |
| `favorites.list` | `{ items[] }` | Liste des favoris |
| `error` | `{ code, message }` | Erreur |

#### Artwork

Les artwork sont servies via HTTP (pas WebSocket) pour éviter de bloquer
le canal de commandes :

```
GET http://<ip>:9845/artwork/<trackId>?size=300
```

Retourne un JPEG/PNG redimensionné. L'app iOS utilise AsyncImage avec cache.

### 2.3 Architecture iOS (SwiftUI)

```
noir-ios/
├── NoirCompanion/
│   ├── App/
│   │   ├── NoirCompanionApp.swift          # @main, injection des dépendances
│   │   └── AppState.swift                  # État global observable
│   │
│   ├── Network/
│   │   ├── ServiceDiscovery.swift          # mDNS browser (NWBrowser)
│   │   ├── WebSocketClient.swift           # URLSessionWebSocketTask
│   │   ├── MessageEncoder.swift            # Encodage JSON des commandes
│   │   └── MessageDecoder.swift            # Décodage JSON des réponses
│   │
│   ├── Models/
│   │   ├── Track.swift                     # id, title, artist, album, duration, isFavorite
│   │   ├── Album.swift                     # id, title, artist, trackCount, artworkURL
│   │   ├── Artist.swift                    # id, name, albumCount
│   │   ├── PlayerState.swift               # state, currentTrack, position, duration, volume
│   │   └── Message.swift                   # Enveloppe protocol (Codable)
│   │
│   ├── ViewModels/
│   │   ├── ConnectionViewModel.swift       # Découverte + connexion
│   │   ├── PlayerViewModel.swift           # Contrôle du player
│   │   ├── LibraryViewModel.swift          # Recherche + browse
│   │   └── FavoritesViewModel.swift        # Gestion favoris
│   │
│   ├── Views/
│   │   ├── Connection/
│   │   │   ├── DiscoveryView.swift         # Liste des Macs trouvés
│   │   │   └── ConnectingView.swift        # Animation de connexion
│   │   │
│   │   ├── Player/
│   │   │   ├── NowPlayingView.swift        # Vue principale player
│   │   │   ├── PlayerControlsView.swift    # Play/Pause/Skip buttons
│   │   │   ├── ProgressBar.swift           # Seek bar interactive
│   │   │   └── VolumeSlider.swift          # Contrôle volume
│   │   │
│   │   ├── Library/
│   │   │   ├── LibraryView.swift           # Browse par catégorie
│   │   │   ├── SearchView.swift            # Recherche
│   │   │   ├── AlbumDetailView.swift       # Liste tracks d'un album
│   │   │   ├── ArtistDetailView.swift      # Albums d'un artiste
│   │   │   └── TrackRow.swift              # Cellule track réutilisable
│   │   │
│   │   └── Favorites/
│   │       └── FavoritesView.swift         # Liste des favoris
│   │
│   └── Utilities/
│       ├── ArtworkLoader.swift             # Cache d'images async
│       └── HapticFeedback.swift            # Retour haptique sur actions
│
├── NoirCompanionTests/
│   ├── MessageEncoderTests.swift
│   ├── MessageDecoderTests.swift
│   ├── PlayerViewModelTests.swift
│   └── MockWebSocketClient.swift
│
└── NoirCompanionUITests/
    └── PlayerFlowTests.swift
```

### 2.4 Module serveur (intégré à Noir Desktop)

Le serveur est un Swift Package ajouté comme dépendance au projet macOS :

```
noir-server/
├── Package.swift
├── Sources/
│   └── NoirServer/
│       ├── NoirServer.swift                # Point d'entrée, start/stop
│       ├── WebSocketServer.swift           # NIOWebSocketHandler
│       ├── HTTPHandler.swift               # Artwork serving
│       ├── ServiceAdvertiser.swift         # NWListener pour mDNS
│       ├── MessageRouter.swift             # Dispatch des commandes
│       ├── PlayerBridge.swift              # Protocol que Noir Desktop implémente
│       └── LibraryBridge.swift             # Protocol pour accès à la library
│
└── Tests/
    └── NoirServerTests/
        ├── WebSocketServerTests.swift
        ├── MessageRouterTests.swift
        └── MockPlayerBridge.swift
```

**Intégration avec Noir Desktop :**

```swift
// Dans Noir Desktop, on implémente les protocols bridge :

protocol PlayerBridge: AnyObject {
    var currentState: PlayerState { get }
    func play(trackId: String)
    func pause()
    func resume()
    func seek(to position: TimeInterval)
    func skipNext()
    func skipPrevious()
    func setVolume(_ volume: Float)
    var statePublisher: AnyPublisher<PlayerState, Never> { get }
}

protocol LibraryBridge: AnyObject {
    func search(query: String, limit: Int) async -> [Track]
    func browse(category: BrowseCategory, offset: Int, limit: Int) async -> BrowsePage
    func getAlbum(id: String) async -> AlbumDetail?
    func getArtist(id: String) async -> ArtistDetail?
    func addFavorite(trackId: String) async
    func removeFavorite(trackId: String) async
    func listFavorites(offset: Int, limit: Int) async -> [Track]
}
```

L'app desktop instancie `NoirServer` et lui passe ses implémentations concrètes
de `PlayerBridge` et `LibraryBridge`. Le serveur gère le réseau, le desktop
gère le player et la library.

---

## 3. Flux utilisateur MVP

### 3.1 Connexion

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│  Discovery   │────►│  Connecting   │────►│  Now Playing │
│  (scan mDNS) │     │  (websocket)  │     │  (player UI) │
└──────────────┘     └───────────────┘     └──────────────┘
```

### 3.2 Navigation principale (TabBar)

```
┌─────────┬──────────┬───────────┬──────────┐
│ Player  │ Library  │ Search    │ Favorites│
│   ♪     │   📚     │   🔍      │   ♥      │
└─────────┴──────────┴───────────┴──────────┘
```

### 3.3 Lancer une track

```
User tape "Search" → tape "Daft Punk"
  → Client envoie : { type: "library.search", payload: { query: "Daft Punk" } }
  → Server répond : { type: "library.results", payload: { items: [...] } }
User tape sur "Around the World"
  → Client envoie : { type: "player.play", payload: { trackId: "abc123" } }
  → Server lance la track, push : { type: "player.state", payload: { state: "playing", ... } }
  → L'UI Now Playing se met à jour
  → Server push toutes les 1s : { type: "player.progress", payload: { position: 12.5 } }
```

---

## 4. Stratégie de test

### 4.1 Tests unitaires

| Cible | Quoi tester | Outil |
|-------|-------------|-------|
| **Message encoding/decoding** | Sérialisation JSON ↔ types Swift | XCTest |
| **PlayerViewModel** | Réaction aux messages, envoi de commandes | XCTest + MockWebSocket |
| **LibraryViewModel** | Recherche, pagination, états loading/error | XCTest + MockWebSocket |
| **MessageRouter (serveur)** | Dispatch correct des commandes | XCTest + MockPlayerBridge |
| **WebSocketServer** | Connexion, déconnexion, messages malformés | XCTest + client de test |

### 4.2 Simulateur Desktop (outil de dev critique)

Pour tester l'app iOS **sans** Noir Desktop complet, on crée un **simulateur CLI** :

```
noir-companion/tools/
└── noir-desktop-simulator/
    ├── Package.swift
    └── Sources/
        └── main.swift      # Serveur WebSocket avec fake library
```

Ce simulateur :
- Publie un service mDNS `_noir-player._tcp`
- Accepte les connexions WebSocket
- Contient une **fake library** de 50 tracks avec metadata réaliste
- Simule un player (play/pause change l'état, progress avance toutes les 1s)
- Log toutes les commandes reçues en console (debug)
- Sert des artwork placeholder via HTTP

```bash
# Lancer le simulateur
swift run noir-desktop-simulator

# Output :
# [NoirSim] mDNS: Publishing _noir-player._tcp on port 9845
# [NoirSim] Server ready. Waiting for connections...
# [NoirSim] Client connected: iPhone de Thomas
# [NoirSim] ← player.play { trackId: "track-007" }
# [NoirSim] → player.state { state: "playing", track: "Around the World" }
```

### 4.3 Tests d'intégration

```
┌─────────────┐     WebSocket      ┌───────────────────┐
│  XCTest     │◄──────────────────►│ Desktop Simulator  │
│  (iOS app)  │    localhost        │ (launched par le   │
│             │                     │  test setup)       │
└─────────────┘                     └───────────────────┘
```

Le test setup lance le simulateur en process, l'app iOS se connecte dessus,
et on vérifie les flux end-to-end.

### 4.4 Tests UI (XCUITest)

Scénarios MVP :
1. **Discovery → Connect** : L'app trouve le simulateur et s'y connecte
2. **Search → Play** : Recherche "Daft", tape sur un résultat, le player affiche la track
3. **Player controls** : Play/Pause/Skip change l'état affiché
4. **Seek** : Glisser la barre de progression
5. **Favorites** : Ajouter/retirer un favori, vérifier dans l'onglet Favorites

### 4.5 Test matrice

| Niveau | iOS App | Desktop Server | Simulateur |
|--------|---------|----------------|------------|
| Unit tests | ViewModels, Models, Network | MessageRouter, Bridges | N/A |
| Integration | App ↔ Simulateur | Server ↔ MockPlayer | N/A |
| UI tests | XCUITest ↔ Simulateur | N/A | N/A |
| Manual | iPhone ↔ Mac (real) | Noir Desktop réel | Debug tool |

---

## 5. Plan v2 — Android + améliorations

### 5.1 App Android (Kotlin)

```
noir-android/
├── app/src/main/java/com/noir/companion/
│   ├── network/
│   │   ├── ServiceDiscovery.kt        # NsdManager (équivalent Android de Bonjour)
│   │   ├── WebSocketClient.kt         # OkHttp WebSocket
│   │   └── MessageCodec.kt            # kotlinx.serialization JSON
│   ├── model/
│   ├── viewmodel/
│   └── ui/                            # Jetpack Compose
```

Le protocole WebSocket JSON est **identique** — c'est l'avantage d'avoir
choisi un format standard plutôt qu'un truc Apple-specific.

### 5.2 Shared protocol package

Pour v2, on extrait la spec du protocole dans un schéma partagé :

```
shared/proto/
├── messages.schema.json               # JSON Schema du protocole
├── generate-swift.sh                   # Génère les types Codable
└── generate-kotlin.sh                  # Génère les data classes
```

### 5.3 Améliorations v2

| Feature | Description |
|---------|-------------|
| **PIN pairing** | Code à 4 chiffres affiché sur le Mac pour sécuriser la connexion |
| **Queue management** | Voir/réordonner la file d'attente depuis le mobile |
| **Multi-room** | Contrôler plusieurs instances de Noir sur différents Macs |
| **Artwork sync** | Cache local persistant des artwork sur le mobile |
| **Offline favorites** | Synchroniser la liste de favoris localement |
| **Widget iOS/Android** | Mini player sur l'écran d'accueil |
| **WAN access** | Accès hors LAN via tunnel (Tailscale/WireGuard) |

---

## 6. Dépendances

### iOS App

| Package | Usage | Source |
|---------|-------|--------|
| Aucun framework externe | SwiftUI + Foundation suffisent pour le MVP | — |

L'app iOS MVP n'a **aucune dépendance externe**. Tout est dans le SDK Apple :
- `Network.framework` → mDNS discovery (NWBrowser)
- `URLSessionWebSocketTask` → WebSocket client
- `SwiftUI` → UI
- `Combine` → Reactive bindings

### Desktop Server (Swift Package)

| Package | Usage |
|---------|-------|
| `swift-nio` | Serveur HTTP + WebSocket haute performance |
| `swift-nio-extras` | Helpers HTTP |

### Simulateur Desktop

Même dépendances que le serveur desktop.

---

## 7. Roadmap MVP

### Phase 1 — Fondations
- [ ] Protocole de messages : types Swift Codable (partagés iOS + serveur)
- [ ] Module serveur : WebSocket + mDNS + HTTP artwork
- [ ] Simulateur desktop CLI

### Phase 2 — iOS App
- [ ] Discovery screen (scan mDNS, afficher les Macs)
- [ ] Connexion WebSocket + handshake auth
- [ ] Now Playing view (artwork, titre, artiste, progress bar)
- [ ] Player controls (play/pause/seek/skip/volume)

### Phase 3 — Library & Favorites
- [ ] Search view avec résultats en temps réel
- [ ] Browse library (artists, albums, tracks)
- [ ] Album detail → lancer une track
- [ ] Favorites (ajouter/retirer/lister)

### Phase 4 — Polish & Tests
- [ ] Tests unitaires (ViewModels + MessageRouter)
- [ ] Tests d'intégration (app ↔ simulateur)
- [ ] Tests UI (XCUITest)
- [ ] Gestion des erreurs réseau (reconnexion automatique)
- [ ] Animations et haptic feedback
