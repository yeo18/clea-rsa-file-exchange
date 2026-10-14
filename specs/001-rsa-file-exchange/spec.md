# Spécification : Échange de fichiers chiffrés RSA

**Feature Branch** : `001-rsa-file-exchange`  
**Created** : 2026-10-12  
**Status** : Clarifications terminées — implémentation réalisée et validée  
**Input** : Application web React/TypeScript/Vite et Spring Boot permettant à des étudiants d'échanger en direct des messages et fichiers confidentiels avec RSA-OAEP et AES-GCM. Les utilisateurs possèdent un compte et PostgreSQL peut être exécuté avec Docker.

## Contexte

Le destinataire crée une paire de clés et transmet sa clé publique à son binôme. Après authentification, l'expéditeur peut envoyer en direct un message confidentiel ou chiffrer un fichier avec la clé publique du destinataire. Le navigateur réalise la cryptographie; le serveur relaie uniquement du contenu chiffré. Les messages ne sont pas conservés lorsque le destinataire est absent.

## Clarifications

### Session 2026-10-12

- Q: Pour que votre binôme puisse voir le message, voulez-vous que Cléa crée un message chiffré à télécharger puis à lui envoyer (sans compte ni serveur de messages), ou faut-il qu’il le reçoive directement dans l’application ? → A: Envoi direct dans l'application.
- Q: Le destinataire doit-il être connecté au même moment pour recevoir le message, ou doit-il pouvoir le retrouver plus tard s’il est absent ? → A: Le destinataire est connecté au même moment; aucun stockage de message hors ligne.
- Q: Comment voulez-vous que l’expéditeur et le destinataire se retrouvent pour échanger en direct, sans compte ? → A: Comptes utilisateurs et base PostgreSQL exécutée avec Docker; la préférence initiale pour un code sans compte est remplacée.
- Q: Lors de la création d’un compte, faut-il vérifier l’adresse e-mail avant que la personne puisse se connecter ? → A: Vérification obligatoire par e-mail; un service SMTP doit être configuré.

La création de compte utilise l'adresse e-mail et un mot de passe, avec une vérification par e-mail obligatoire avant connexion.

## Scénarios utilisateur et tests

### US1 — Créer et échanger les clés (Priorité : P1)

Un étudiant génère une paire RSA, télécharge la clé publique et exporte la clé privée dans un fichier protégé par mot de passe.

**Pourquoi cette priorité** : les deux autres parcours dépendent de clés valides, et une clé privée non protégée compromettrait toute la démonstration.

**Test indépendant** : générer une paire, exporter les deux fichiers, réimporter la clé privée avec le bon mot de passe et vérifier le statut des clés; un mot de passe erroné doit échouer.

**Scénarios d'acceptation** :
1. Étant donné que l'utilisateur lance la génération, quand le navigateur termine RSA-OAEP 3072 bits/SHA-256, alors les clés sont créées côté client et un état de progression puis de réussite est affiché.
2. Étant donné une paire générée, quand l'utilisateur exporte la clé publique, alors il reçoit une clé SPKI PEM partageable.
3. Étant donné une paire générée, quand l'utilisateur exporte la clé privée, alors le fichier PKCS#8 est chiffré et authentifié avec une clé AES-GCM dérivée du mot de passe; aucun export privé en clair n'est proposé.
4. Étant donné un fichier de clé privée protégé, quand le mot de passe est incorrect ou que le fichier est altéré, alors aucune clé n'est importée et un message sûr est affiché.

### US2 — Chiffrer un fichier pour le binôme (Priorité : P1)

L'expéditeur charge localement la clé publique du destinataire et un fichier, puis télécharge un paquet `.rsaenc` chiffré.

**Pourquoi cette priorité** : ce parcours produit l'objet effectivement partageable et réalise le cœur du sujet.

**Test indépendant** : à partir d'une clé publique de test, chiffrer un fichier témoin et vérifier le format du paquet, l'absence du texte clair et l'absence d'envoi réseau du fichier.

**Scénarios d'acceptation** :
1. Étant donné une clé publique SPKI PEM valide et un fichier de 0 à 50 MiB, quand l'expéditeur chiffre, alors une nouvelle clé AES-256 et un IV GCM aléatoire sont créés, la clé AES est enveloppée avec RSA-OAEP/SHA-256 et le fichier `.rsaenc` est téléchargé.
2. Étant donné un fichier supérieur à 50 MiB ou une clé publique invalide, quand l'utilisateur tente de chiffrer, alors l'opération est refusée clairement avant tout envoi ou traitement coûteux.
3. Quand le chiffrement se termine, alors le serveur n'a reçu ni fichier, ni clé, ni mot de passe; le fichier produit contient seulement le texte chiffré et les métadonnées documentées.

### US3 — Déchiffrer et restaurer le fichier (Priorité : P1)

Le destinataire sélectionne le paquet `.rsaenc`, importe son fichier de clé privée protégé, saisit son mot de passe et télécharge le fichier restitué.

**Pourquoi cette priorité** : un chiffrement sans restauration testable ne satisfait pas le scénario officiel.

**Test indépendant** : déchiffrer un paquet avec la clé privée correspondante et comparer octet pour octet le résultat; modifier un octet du paquet doit provoquer un échec d'authentification.

**Scénarios d'acceptation** :
1. Étant donné le paquet et la clé privée correspondante, quand le mot de passe est valide, alors le navigateur déchiffre la clé AES puis le contenu, et restaure le nom et le type MIME d'origine lorsque ces métadonnées sont valides.
2. Étant donné une mauvaise clé, un mot de passe erroné, un paquet tronqué/corrompu ou une version inconnue, quand l'utilisateur lance le déchiffrement, alors aucun fichier partiel n'est proposé et une erreur compréhensible sans donnée sensible est affichée.
3. Étant donné un paquet dont les métadonnées ou le contenu ont été modifiés, quand l'authentification AES-GCM échoue, alors le fichier est rejeté.

### US4 — Vérifier le service et comprendre le parcours (Priorité : P2)

L'étudiant peut vérifier que l'API Spring Boot répond et comprend les étapes principales de l'échange depuis une interface professionnelle et accessible.

**Test indépendant** : démarrer séparément le backend et le frontend, confirmer l'état de santé via l'API, puis parcourir les vues clés, chiffrement et déchiffrement avec clavier.

**Scénarios d'acceptation** :
1. Quand le frontend interroge `GET /api/health`, alors le backend répond `200` avec `{"status":"UP"}` sans recevoir de données de fichier ou de clé.
2. Quand le backend est indisponible, alors l'interface indique que le contrôle de santé est indisponible sans bloquer le chiffrement local.
3. Quand l'utilisateur ouvre l'application, alors les actions « Chiffrer un fichier », « Déchiffrer un fichier » et « Gérer les clés » sont distinctes, lisibles et utilisables sur écran étroit et au clavier.

### US5 — Créer et vérifier un compte (Priorité : P1)

Un étudiant crée un compte avec son adresse e-mail et un mot de passe, reçoit un lien de vérification et peut se connecter uniquement après validation.

**Pourquoi cette priorité** : les messages sont adressés à des personnes identifiées par leur compte; un compte non vérifié ne doit pas recevoir de messages.

**Test indépendant** : inscrire une adresse, confirmer qu'aucune connexion n'est permise avant validation, puis vérifier l'adresse avec un lien valide qui ouvre une session; un lien invalide, expiré ou déjà consommé doit échouer.

**Scénarios d'acceptation** :
1. Quand un compte est créé, alors le mot de passe est haché avant stockage dans PostgreSQL et un lien de vérification à usage unique est envoyé par SMTP.
2. Étant donné un compte non vérifié, quand son titulaire tente de se connecter, alors l'accès est refusé avec une indication de vérifier sa boîte de réception.
3. Étant donné un lien valide non expiré, quand son titulaire l'utilise, alors l'adresse est marquée comme vérifiée et une session authentifiée est ouverte.
4. Étant donné un lien expiré, déjà utilisé ou invalide, quand il est présenté, alors la vérification est refusée et aucun jeton sensible n'est journalisé.
5. Étant donné un compte non vérifié, quand son titulaire demande un nouvel e-mail de vérification, alors l'application renvoie une réponse générique et applique une limite de débit sans révéler l'existence ni l'état du compte.

### US6 — Envoyer un message confidentiel en direct (Priorité : P1)

Deux étudiants possédant chacun un compte sont connectés. L'expéditeur sélectionne son destinataire, saisit un message et l'envoie; le destinataire le reçoit en direct et le voit après déchiffrement dans son navigateur.

**Pourquoi cette priorité** : l'enseignant demande explicitement que l'application envoie un message à une personne et que celle-ci puisse le lire.

**Test indépendant** : deux comptes vérifiés se connectent avec leurs propres clés; envoyer un message doit le rendre lisible au destinataire connecté, et toute déconnexion pendant l'envoi doit produire un état d'échec explicite sans conserver le message.

**Scénarios d'acceptation** :
1. Étant donné deux comptes en ligne et la clé publique vérifiée du destinataire, quand l'expéditeur envoie un message, alors son navigateur chiffre le contenu avec une clé AES-GCM temporaire et enveloppe cette clé avec RSA-OAEP; le destinataire reçoit seulement le paquet chiffré et le déchiffre localement.
2. Étant donné que le destinataire n'est pas connecté ou que la connexion est interrompue, quand un message est envoyé, alors l'expéditeur voit un échec explicite et aucun message n'est mis en file ni stocké pour plus tard.
3. Quand l'option de démonstration cryptographique est activée en développement, alors la console affiche les algorithmes, la taille de la clé AES enveloppée par RSA-OAEP et un extrait du texte chiffré AES-GCM; le texte clair, les mots de passe, les clés privées et les jetons restent exclus des journaux.
4. Étant donné un paquet de message altéré ou chiffré pour une autre paire de clés, quand le destinataire le reçoit, alors AES-GCM rejette le contenu et aucun texte partiel n'est affiché.

## Cas limites

- Fichier vide : pris en charge; le tag GCM doit néanmoins être présent.
- Fichier dépassant 50 MiB : refus avant lecture complète.
- Paquet tronqué, longueur d'en-tête incohérente, JSON malformé, champs manquants, métadonnées surdimensionnées ou version/algorithme inconnus : rejet contrôlé.
- Chaque opération génère une clé AES et un IV aléatoires indépendants; aucune clé AES n'est réutilisée pour un autre fichier.
- Mauvaise clé privée ou clé d'une taille/algorithme incompatible : message de déchiffrement générique, aucune restitution.
- Nom de fichier contenant un chemin ou des caractères de contrôle : normaliser à un nom de base sûr avant téléchargement.
- Type MIME absent ou invalide : restitution avec type générique `application/octet-stream`.
- Fermeture ou annulation pendant le traitement : ne jamais proposer un téléchargement incomplet.
- Navigateur sans Web Crypto ou contexte non sécurisé : bloquer les opérations cryptographiques avec une explication et rappeler HTTPS; localhost est autorisé pour le développement.
- Pression mémoire : traitement en mémoire limité à 50 MiB, indicateur de progression et libération des références d'objets après usage; ne pas prétendre effacer physiquement la mémoire.
- Destinataire absent, déconnecté, ou session expirée : ne pas mettre en file; afficher que le message n'a pas été remis et ne pas le persister.
- Salon WebSocket non autorisé, paquet de message mal formé, trop grand ou invalide : rejeter sans journaliser son contenu et sans révéler d'information au destinataire incorrect.
- Lien de validation absent, expiré ou déjà consommé : interdire l'ouverture de session et permettre une nouvelle demande de vérification sans révéler si une adresse non vérifiée appartient à un compte.

## Exigences

### Fonctionnelles

- **FR-001** : l'application MUST fournir les parcours de gestion des clés, chiffrement/déchiffrement de fichiers, création de compte/connexion et messagerie en direct.
- **FR-002** : le navigateur MUST générer une paire RSA-OAEP 3072 bits, SHA-256, exposant public 65537, et afficher un statut de traitement.
- **FR-003** : la clé publique MUST être exportée/importée en SPKI PEM.
- **FR-004** : la clé privée MUST être exportée uniquement en PKCS#8 chiffré dans un fichier versionné `.rsakey`; un mot de passe d'au moins 12 caractères est requis.
- **FR-005** : le fichier `.rsakey` MUST protéger les octets DER PKCS#8 avec PBKDF2-HMAC-SHA-256 (600 000 itérations, sel aléatoire de 16 octets) et AES-256-GCM (IV aléatoire de 12 octets); son en-tête doit être authentifié. Les paramètres sont bornés/validés lors de l'import.
- **FR-006** : le navigateur MUST générer une clé AES-256-GCM neuve par fichier avec un IV aléatoire de 12 octets; il MUST envelopper la clé avec RSA-OAEP de la clé publique du destinataire.
- **FR-007** : le format `.rsaenc` MUST être un conteneur binaire versionné et documenté, inclure les algorithmes/paramètres, la clé AES enveloppée, l'IV, les métadonnées minimales et le texte chiffré; AES-GCM MUST authentifier intégralement l'en-tête.
- **FR-008** : le nom de fichier et le type MIME d'origine MAY être stockés en clair dans l'en-tête; l'interface MUST l'expliquer. Le nom restitué MUST être réduit à un nom de base sûr.
- **FR-009** : le traitement MUST être limité à 50 MiB par fichier et MUST refuser les fichiers trop grands avant leur lecture.
- **FR-010** : le navigateur MUST pouvoir importer une clé privée protégée, demander le mot de passe, unwrap la clé AES, déchiffrer et télécharger le fichier exact.
- **FR-011** : les erreurs de clé, mot de passe, format, version et intégrité MUST être présentées sans exposer le contenu, le mot de passe ou la clé.
- **FR-012** : le backend Spring Boot MUST être démarrable séparément et exposer `GET /api/health` répondant `200` et `{"status":"UP"}` lorsqu'il fonctionne.
- **FR-013** : le backend MUST gérer les comptes vérifiés dans PostgreSQL et relayer en temps réel les paquets de messages chiffrés; il MUST refuser l'upload de fichiers, clés privées, mots de passe de clés et messages en clair.
- **FR-014** : le frontend MUST rester utilisable pour les opérations cryptographiques locales si le backend est arrêté; l'inscription, la connexion et la messagerie exigent le backend.
- **FR-015** : l'interface MUST présenter clairement que le chiffrement ne signe pas le fichier, ne prouve pas l'identité de l'expéditeur et que la clé publique doit être vérifiée avec le binôme.
- **FR-016** : la documentation MUST expliquer la complémentarité RSA-OAEP/AES-GCM, les formats de clés, la distribution de clé publique, la conservation du secret privé, HTTPS, l'absence de journalisation sensible et les limites d'effacement mémoire.
- **FR-017** : les messages MUST être chiffrés dans le navigateur avec une clé AES-GCM temporaire et RSA-OAEP/SHA-256 pour cette clé; le backend MUST relayer uniquement le paquet chiffré à un destinataire connecté et MUST ne pas persister les messages.
- **FR-018** : la console MUST rester silencieuse par défaut; une option explicite de démonstration, limitée au développement, MAY y présenter un extrait du ciphertext et les paramètres cryptographiques sans afficher le texte clair, les secrets ou les identifiants de session.
- **FR-019** : l'application MUST permettre l'inscription, la connexion et la déconnexion avec adresse e-mail et mot de passe; les comptes MUST être persistés dans PostgreSQL et les mots de passe MUST être hachés avec un algorithme dédié, jamais stockés en clair.
- **FR-020** : l'inscription MUST envoyer un lien de vérification à usage unique par SMTP; un compte non vérifié ne peut pas ouvrir de session; un lien de vérification MUST expirer après 24 heures.
- **FR-021** : les utilisateurs vérifiés MUST pouvoir rechercher un destinataire par adresse e-mail et transmettre un message uniquement s'il est connecté et possède une clé publique RSA enregistrée.
- **FR-022** : la clé publique peut être enregistrée sur le serveur pour l'adressage; la clé privée et son mot de passe MUST rester dans le navigateur et ne jamais être reçus par le backend.
- **FR-023** : l'application MUST permettre une trace cryptographique pédagogique uniquement en développement et après activation explicite; elle montre que RSA chiffre la clé AES et AES-GCM chiffre le message, sans exposer le texte clair.
- **FR-024** : l'application MUST permettre de renvoyer le lien de vérification d'un compte non vérifié sans révéler si l'adresse existe ou est déjà vérifiée; l'envoi MUST être limité à un lien par adresse et par minute, et cinq liens par adresse et par heure.

### Entités et formats

- **Paire de clés** : RSA-OAEP; clé publique SPKI PEM partageable; clé privée PKCS#8 DER conservée côté client et exportée uniquement dans `.rsakey` chiffré.
- **Fichier source** : octets sélectionnés par l'utilisateur, taille maximale 50 MiB, nom et type MIME optionnels.
- **Paquet `.rsaenc` v1** : 8 octets magiques ASCII `RSAENC01`, 4 octets longueur d'en-tête non signé big-endian, en-tête JSON UTF-8 de 1 à 8192 octets, puis résultat AES-GCM (texte chiffré suivi du tag 128 bits). L'en-tête JSON contient `version: 1`, identifiants d'algorithmes, IV base64, clé AES enveloppée base64, nom et type MIME optionnels. Les octets exacts du préfixe et de l'en-tête forment l'AAD GCM.
- **Fichier `.rsakey` v1** : enveloppe JSON UTF-8 avec version, KDF et paramètres, sel, algorithme AES-GCM, IV et PKCS#8 chiffré base64; les octets JSON canoniques hors champ ciphertext servent d'AAD. Le format est propre à l'application et son formatage est documenté.
- **État de santé** : réponse sans état ni stockage contenant uniquement le statut du processus backend.
- **Compte** : adresse e-mail unique, état de vérification, mot de passe haché et clé publique SPKI PEM facultative; persisté dans PostgreSQL.
- **Jeton de vérification** : valeur aléatoire à usage unique envoyée par e-mail; seule son empreinte est conservée en base pendant au plus 24 heures.
- **Message direct** : texte saisi côté client, chiffré avant transmission, transmis à une session destinataire active et supprimé après réception; ni texte clair ni ciphertext persistant n'est conservé.

## Critères de succès

- **SC-001** : 100 % des fichiers témoins acceptés (y compris fichier vide) sont restitués octet pour octet après chiffrement/déchiffrement avec la bonne paire.
- **SC-002** : toute altération testée du contenu chiffré ou de l'en-tête authentifié est rejetée sans produire de fichier restauré.
- **SC-003** : un fichier au-delà de 50 MiB et un paquet hors limites sont rejetés avant traitement coûteux.
- **SC-004** : inspection des requêtes réseau pendant chiffrement/déchiffrement confirme que seuls les appels santé sont transmis, sans octets de fichier, clé privée ni mot de passe.
- **SC-005** : backend et frontend ont chacun des commandes documentées de démarrage et de tests; le health-check est vérifié par un test automatisé.
- **SC-006** : les principaux parcours sont accessibles au clavier, avec états chargement/réussite/erreur et sans dépendre du backend pour la cryptographie.
- **SC-007** : deux comptes connectés peuvent envoyer et afficher un message dans le navigateur destinataire; l'inspection des requêtes réseau ne révèle que ciphertext et métadonnées minimales.
- **SC-008** : un destinataire absent ou déconnecté ne reçoit aucun message ultérieurement; les messages ne figurent pas dans les tables PostgreSQL.
- **SC-009** : un compte non vérifié ne peut pas se connecter; un lien valide active le compte et les liens invalides/expirés/réutilisés échouent.
- **SC-010** : inspection de PostgreSQL confirme que seuls des mots de passe hachés, des jetons de vérification hachés, des identifiants et des clés publiques sont persistés; aucun message privé ni clé privée n'est enregistré.

## Hypothèses et périmètre

- L'interface utilisateur est en français et cible les navigateurs modernes exposant Web Crypto en contexte sécurisé.
- Le plafond de 50 MiB est une limite produit v1 choisie pour borner la mémoire avec les API Web Crypto non-streaming.
- L'export `.rsakey` est une enveloppe versionnée de l'application, pas un fichier PKCS#8 chiffré interopérable avec tous les outils externes.
- Le serveur ne joue aucun rôle cryptographique; il gère les comptes et relaie les messages chiffrés en direct, sans stockage des messages ou des clés privées/fichiers.
- PostgreSQL est destiné aux comptes, clés publiques et jetons de validation à usage unique; les messages ne sont jamais enregistrés.
- La vérification d'adresse e-mail utilise un SMTP configurable. Pour le développement local, Mailpit dans Docker peut capturer les courriels sans contacter un service externe.
- Les adresses e-mail sont normalisées en supprimant les espaces périphériques puis en convertissant l'adresse entière en minuscules avec `Locale.ROOT`; aucun alias spécifique à un fournisseur n'est appliqué.
- Un renvoi de vérification est limité à un e-mail par adresse normalisée et par minute, et cinq par heure; une réponse générique ne révèle pas si le compte existe, est vérifié ou a été limité.
- Sont exclus : signatures, stockage/boîte de réception des messages, archivage, analyse antivirus et restauration de mot de passe.
