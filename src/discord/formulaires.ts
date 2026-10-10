import { MessageFlags, type ButtonInteraction, type ModalSubmitInteraction } from "discord.js";

// Formulaires (modals) ouverts dont une operation attend la soumission, par customId
const formulairesAttendus = new Set<string>();

// Attend la soumission du formulaire idFormulaire ouvert par clic ; null si le delai expire. Le formulaire reste
// repertorie pendant l'attente : une soumission arrivee hors attente (delai depasse, bot redemarre, formulaire deja
// soumis) recoit un message clair au lieu de « L'application ne repond plus » (voir repondreFormulaireOrphelin).
export async function attendreFormulaire(
  clic: Pick<ButtonInteraction, "awaitModalSubmit">,
  idFormulaire: string,
  delaiMs: number,
): Promise<ModalSubmitInteraction | null> {
  formulairesAttendus.add(idFormulaire);
  try {
    return await clic.awaitModalSubmit({ time: delaiMs, filter: (i) => i.customId === idFormulaire });
  } catch {
    return null;
  } finally {
    formulairesAttendus.delete(idFormulaire);
  }
}

// Soumission qu'aucune operation n'attend : reponse ephemere invitant a recommencer. Appele des la reception, avant
// les collecteurs (l'attente en cours est encore repertoriee).
export async function repondreFormulaireOrphelin(soumission: ModalSubmitInteraction): Promise<void> {
  if (formulairesAttendus.has(soumission.customId)) return;
  await soumission.reply({
    content: "Ce formulaire n'est plus actif (délai dépassé, déjà envoyé ou bot redémarré) : rouvrez-le avec le bouton d'origine.",
    flags: MessageFlags.Ephemeral,
  });
}
