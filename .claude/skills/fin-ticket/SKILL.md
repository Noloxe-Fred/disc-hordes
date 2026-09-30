---
name: fin-ticket
description: Clôture le ticket en cours — commit, push, passage du ticket Airtable en Terminé, puis rappel de taper /clear. À lancer uniquement quand l'utilisateur tape /fin-ticket ou dit « fin ticket ».
argument-hint: "[T29]"
disable-model-invocation: true
---

# Fin de ticket

L'utilisateur clôt le ticket sur lequel on vient de travailler. Enchaîner les étapes sans redemander, sauf en cas de doute signalé ci-dessous.

## 1. Identifier le ticket

- Si `$ARGUMENTS` contient un numéro (ex. `T29`), c'est celui-là.
- Sinon, prendre le ticket travaillé dans la conversation.
- Si aucun ticket n'est identifiable, demander le numéro avant d'aller plus loin.

## 2. Commit

- `git status` et `git diff` pour voir ce qui a changé.
- Ne stager que les fichiers liés au ticket, en les nommant un par un. Ne jamais ajouter `Dis'Hordes.code-workspace` ni des fichiers sans rapport. S'il y a des changements étrangers au ticket, les laisser de côté et le dire.
- Vérifier le typage avant de commiter : `npx tsc --noEmit -p .`. S'il échoue, s'arrêter et montrer l'erreur.
- Message en français, à l'impératif présent, **sans accents**, sur une ligne qui décrit ce qui a été livré, dans le style des commits existants (`git log --oneline -5`). Exemple : `Ajoute les degats de l'attaque sur les chantiers : structures, palissade, avancement en cours et palier au hasard`.
- Terminer le message par la ligne d'attribution demandée par le système (`Co-Authored-By: …`).
- Si rien n'est à commiter, passer directement au push et au ticket.

## 3. Push

- `git push` sur la branche courante (`main`, remote `origin`).
- En cas de refus (retard sur le remote, conflit), s'arrêter et expliquer ; pas de force push.

## 4. Valider le ticket sur Airtable

Base `appj1OD1XTUJFENW7`, table `tblH8b0AJDqXrvOTN`. Toujours passer les IDs de champ :
- Ticket `fldgXHSR4tZwof87k`, Description `fldm3UG9HobDeoITA`, Statut `fldhzxYJ67qOWArUJ`.

Étapes :
1. Retrouver l'enregistrement : `list_records_for_table` avec un filtre `=` sur le champ Ticket (ex. `"T29"`).
2. Lire la Description. Si le « Reste : » ne mentionne **que** la validation en jeu (ou est vide), le remplacer par `Validé le <date du jour>.` et passer le Statut à `Terminé`.
3. Si le « Reste : » liste encore du travail non fait, ne **pas** passer en Terminé : le signaler à l'utilisateur et lui demander s'il veut quand même clore le ticket ou le laisser En cours.

## 5. Terminer

Répondre en quelques lignes : le hash et le message du commit, le push effectué, le statut du ticket. Finir par :

> Tape `/clear` pour repartir d'un contexte vide.

(`/clear` est une commande intégrée de la CLI : Claude ne peut pas la lancer lui-même.)
