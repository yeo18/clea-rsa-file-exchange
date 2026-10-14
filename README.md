# Cléa — échange de fichiers chiffré

Application pédagogique permettant à deux étudiants de s’échanger des fichiers et des messages confidentiels. Le chiffrement et le déchiffrement ont lieu dans le navigateur avec Web Crypto. Le backend conserve les comptes vérifiés et les clés publiques; il relaie les messages chiffrés uniquement vers un destinataire connecté et ne les enregistre jamais.

## Démarrage

Prérequis : Docker Desktop avec Docker Compose, Node.js 24+, npm 11+, Java 21+ et Maven 3.9+.

Depuis la racine, démarrer PostgreSQL et Mailpit :

```powershell
docker compose up -d
```

Mailpit capture localement les e-mails de vérification. Consulter sa boîte de réception sur `http://127.0.0.1:8025`.

Dans un premier terminal :

```powershell
Set-Location backend
mvn spring-boot:run
```

L’API démarre sur `http://localhost:8080`. Vérifier son état :

```powershell
Invoke-RestMethod http://localhost:8080/api/health
```

Réponse attendue : `status: UP`.

Dans un second terminal :

```powershell
Set-Location frontend
npm install
npm run dev
```

Ouvrir `http://localhost:5173` pendant que les deux serveurs restent actifs. Vite transmet `/api` et `/ws` au backend. Si la page ne s’affiche pas, vérifier que `npm run dev` est encore actif et ouvrir cette adresse explicitement.

Les valeurs de connexion locales sont réservées au développement. En production, fournir les secrets via l’environnement, utiliser HTTPS, configurer un fournisseur d’e-mails compatible avec l’hébergeur et limiter les origines autorisées.

## Déploiement public sur Render

Le fichier `render.yaml` décrit une seule origine HTTPS pour l’interface React, l’API Spring et le WebSocket. Le `Dockerfile` construit le frontend, l’intègre au JAR Spring Boot et démarre l’application sur le port fourni par Render. La base PostgreSQL reste séparée.

1. Publier ce dépôt sur GitHub, puis, dans Render, créer un **Blueprint** à partir de ce dépôt et choisir `render.yaml`.
2. Render demandera les valeurs `CLEA_MAIL_RESEND_API_KEY` et `CLEA_MAIL_FROM`. Créer une clé API Resend et renseigner une adresse expéditrice autorisée par Resend. Pour recevoir les e-mails d’inscription à d’autres adresses, vérifier un domaine expéditeur dans Resend; son domaine de test ne permet pas un échange public normal.
3. Attendre que le service `clea` soit déployé, puis ouvrir son URL `https://…onrender.com`. L’endpoint `https://…onrender.com/api/health` doit répondre `{"status":"UP"}`.
4. Tester l’inscription et la réception du lien de vérification, puis le parcours de messagerie à deux comptes.

Le niveau gratuit est uniquement adapté à une démonstration : le service web peut s’endormir après inactivité et une base PostgreSQL gratuite expire après 30 jours. Ne pas y conserver de données importantes. Un hébergement durable nécessite un plan payant; vérifier et approuver ses coûts dans Render avant de le choisir. L’application locale continue d’utiliser SMTP/Mailpit et n’a pas besoin d’une clé Resend.

## Vérification

```powershell
Set-Location frontend
npm test
npm run build
npm run lint
```

```powershell
Set-Location backend
mvn test
mvn package
```

Le parcours de démonstration à deux profils navigateur est décrit dans [le guide de démarrage](specs/001-rsa-file-exchange/quickstart.md). Il couvre la création de compte, la vérification via Mailpit, l’inscription des clés publiques, le message en direct, l’absence de remise hors ligne et le chiffrement de fichiers.

## Parcours

1. Créer deux comptes avec des adresses de démonstration distinctes, puis ouvrir les e-mails de vérification dans Mailpit.
2. Dans deux profils de navigateur, se connecter à chaque compte et générer une paire RSA. Garder le fichier `.rsakey` protégé et son mot de passe secrets; enregistrer la clé publique au compte.
3. Depuis « Messages », rechercher l’adresse du binôme connecté, vérifier l’empreinte SHA-256 par un canal distinct, écrire et envoyer le message. Le navigateur chiffre avant que le backend relaie le paquet.
4. Pour la démonstration cryptographique, activer explicitement l’option « Afficher la trace cryptographique » en développement, puis consulter la console. La trace ne contient ni message en clair, ni clé privée, ni mot de passe.
5. Le parcours de fichier reste disponible : sélectionner le fichier de 50 Mio maximum, chiffrer pour la clé publique du destinataire, partager le `.rsaenc`, puis le déchiffrer dans son navigateur.

La paire générée ne persiste qu’en mémoire dans l’onglet. Une actualisation efface les clés actives; conserver le fichier de clé privée protégé avant de fermer la page.

## Architecture

- `frontend/` — React, TypeScript strict, Vite, Lucide React, Web Crypto et tests Vitest/Testing Library.
- `backend/` — Java 21, Spring Boot, PostgreSQL/Flyway, sessions HTTP/CSRF, vérification e-mail et relais STOMP/WebSocket.
- `docker-compose.yml` — PostgreSQL local sur le port hôte 15432 et Mailpit sur les ports 1025/8025.
- `specs/001-rsa-file-exchange/` — spécification, décisions, plan, modèle, contrat et tâches Spec Kit.

## Choix cryptographiques

- **Génération** : RSA-OAEP 3072 bits, exposant public 65537, SHA-256. La clé publique est exportée au format SPKI PEM. Les octets privés PKCS#8 DER ne sont jamais exportés en clair.
- **Fichier `.rsakey`** : enveloppe JSON versionnée propre à cette application; dérivation PBKDF2-HMAC-SHA-256 (600 000 itérations, sel aléatoire de 16 octets) et protection AES-256-GCM avec IV aléatoire de 12 octets. Le mot de passe doit comporter au moins 12 caractères. Ce format n’est pas un PKCS#8 chiffré interopérable; il faut conserver le fichier et le mot de passe.
- **Paquet `.rsaenc` v1** : conteneur binaire versionné : magie `RSAENC01`, longueur d’en-tête big-endian, métadonnées JSON UTF-8 bornées, puis ciphertext AES-GCM avec tag 128 bits. Une clé AES-256 et un IV aléatoire neuf sont créés par fichier. RSA-OAEP enveloppe uniquement la clé AES. L’en-tête exact, y compris le nom et le type MIME facultatifs (visibles), est authentifié comme AAD.
- **Limite** : 50 Mio par fichier. Web Crypto traite les fichiers en mémoire et ne fournit pas ici de chiffrement par flux; les tailles supérieures sont refusées.

## Modèle de confiance et limites

- La clé publique peut être transmise, mais il faut en vérifier l’empreinte avec le binôme pour éviter une substitution.
- Chiffrer avec une clé publique protège la confidentialité face aux personnes qui ne possèdent pas la clé privée; cela **ne signe pas** le fichier et ne prouve pas l’identité de l’expéditeur.
- RSA-OAEP enveloppe une petite clé; AES-GCM chiffre les octets et détecte les altérations. Un tag invalide empêche le téléchargement du contenu restauré.
- En production, HTTPS est requis pour protéger l’application et ses scripts. En développement, localhost est accepté comme contexte sécurisé.
- Aucun fichier, clé privée ou mot de passe n’est envoyé au backend, enregistré dans le stockage navigateur ou écrit dans les journaux. Les références mémoire sont relâchées après usage, mais JavaScript ne peut pas garantir un effacement physique de la mémoire.
- La protection du `.rsakey` dépend aussi de la robustesse et de la conservation du mot de passe. Si le fichier ou le mot de passe est perdu, l’application ne peut pas récupérer la clé.
- La base de données ne conserve que les comptes, les mots de passe hachés, les jetons de vérification sous forme de condensat et les clés publiques. Aucun message, fichier, ciphertext ou clé privée n’est enregistré.
- Le relais de messages est en direct seulement : le destinataire doit être connecté; un message envoyé à un destinataire absent est refusé et ne sera pas récupérable plus tard. La messagerie ne signe pas les messages et ne vérifie pas cryptographiquement l’identité de l’expéditeur.
- La trace cryptographique en console est désactivée par défaut et n’est disponible qu’en développement. Les messages et secrets ne sont jamais journalisés.
