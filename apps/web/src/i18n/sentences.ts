import type { Lang } from "./index";

/**
 * Sentences that come from the server or the shared validation rules, in English. On patient screens they
 * are shown in the patient's language through this table; agents keep reading the English (D62). DRAFT.
 */
const RW: Record<string, string> = {
  // Validation (packages/shared)
  "Enter the 16 digits on the front of the ID card": "Andika imibare 16 iri imbere ku ndangamuntu",
  "This isn't a Rwandan ID number. Check the digits on the card.": "Iyi si nimero y'indangamuntu yo mu Rwanda. Reba imibare iri ku ndangamuntu.",
  "Enter a date": "Andika itariki",
  "Enter one of your names": "Andika rimwe mu mazina yawe",
  "Describe the problem in your own words": "Sobanura ikibazo mu magambo yawe",
  "Keep it under 2,000 characters": "Ntirenze inyuguti 2.000",
  "Choose how long it has lasted": "Hitamo igihe bimaze",
  "Choose how bad it is": "Hitamo uko bikomeye",
  "Choose your sector": "Hitamo umurenge wawe",
  "Choose whose number it is": "Hitamo nyiri nimero",
  "Enter a Rwandan mobile number like 0788 123 456": "Andika nimero ya telefoni yo mu Rwanda, urugero: 0788 123 456",
  "Write a message": "Andika ubutumwa",
  // API answers a patient can meet
  "This case is closed.": "Ubu busabe bwafunzwe.",
  "This case is already closed.": "Ubu busabe bwari bwarafunzwe.",
  "This case doesn't exist.": "Ubu busabe ntibubaho.",
  "This question isn't the next one. Reload the page.": "Iki si cyo kibazo gikurikira. Ongera ufungure paji.",
  "This question has already been answered.": "Iki kibazo cyamaze gusubizwa.",
  "This case isn't waiting for a description. Reload the page.": "Ubu busabe ntibutegereje ibisobanuro. Ongera ufungure paji.",
  "You are already being cared for at the facility.": "Usanzwe uri kwitabwaho ku ivuriro.",
  "You can only ask for help for yourself or your children.": "Ushobora gusaba ubufasha bwawe cyangwa ubw'abana bawe gusa.",
  "You can see only your own records and your children's.": "Ushobora kureba amakuru yawe n'ay'abana bawe gusa.",
  "You can't send messages on this case.": "Ntushobora kohereza ubutumwa kuri ubu busabe.",
  "This case can't be rated.": "Ubu busabe ntibushobora guhabwa amanota.",
  "You seem to be offline. Check your connection and try again.": "Bisa n'aho nta interineti ufite. Yireba hanyuma wongere ugerageze.",
  "Something went wrong. Try again.": "Hari ikitagenze neza. Ongera ugerageze.",
  // Activity list (FR 10.2): what was done, and by whom
  "Logged in": "Yinjiye",
  "Failed login": "Kwinjira byanze",
  "Started a request for help": "Yatangiye gusaba ubufasha",
  "Sent the request": "Yohereje ubusabe",
  "Answered Yes to a danger sign": "Yasubije Yego ku kimenyetso cy'akaga",
  "Asked for a call": "Yasabye guhamagarwa",
  "A health agent took the request": "Umukozi w'ubuzima yafashe ubusabe",
  "Called the patient": "Yahamagaye umurwayi",
  "Gave the request back to the queue": "Yasubije ubusabe ku murongo",
  "Paused the request for an emergency": "Yahagaritse ubusabe by'akanya kubera ubutabazi bwihutirwa",
  "Closed the request": "Yafunze ubusabe",
  "Cancelled the request": "Yahagaritse ubusabe",
  "Rated the help": "Yatanze amanota ku bufasha",
  "Reviewed the triage": "Yasuzumye uko ikibazo gikomeye",
  "Nearest facility given": "Ivuriro rikwegereye ryatanzwe",
  "Confirmed where to go": "Yemeje aho ujya",
  "Changed where to go": "Yahinduye aho ujya",
  "No free bed nearby": "Nta gitanda kiboneka hafi",
  "No facility could take the case": "Nta vuriro ryashoboraga kwakira ikibazo",
  "No clinician of that specialty on duty": "Nta muganga w'ubwo bumenyi uri ku kazi",
  "Clinician assigned": "Umuganga yagenwe",
  "Another clinician assigned": "Undi muganga yagenwe",
  "Bed held": "Igitanda cyafashwe",
  "Bed released": "Igitanda cyarekuwe",
  "Bed assigned": "Igitanda cyatanzwe",
  "No bed was free": "Nta gitanda cyari kiboneka",
  "Opened the record": "Yafunguye amakuru y'ubuzima",
  "Added to the record": "Yongeye ku makuru y'ubuzima",
  "Updated the record": "Yahinduye amakuru y'ubuzima",
  "Opened the records": "Yafunguye amakuru y'ubuzima",
  "Arrived at the facility": "Yageze ku ivuriro",
  "Photo check didn't match": "Ifoto ntiyahuye",
  "Handed over to another clinician": "Yashyikirijwe undi muganga",
  "Transferred to another facility": "Yimuriwe ku rindi vuriro",
  "Discharged": "Yasezerewe",
  "Visit completed": "Kwivuza byarangiye",
  "Issued a prescription:": "Yanditse imiti:",
  "Cancelled a prescription:": "Yahagaritse urupapuro rw'imiti:",
  "Checked at a pharmacy:": "Byagenzuwe kuri farumasi:",
  "AI suggestion unavailable": "Igitekerezo cya AI nticyabonetse",
  "Turned on notifications": "Yafunguye ubutumwa",
  "The facility stopped expecting the patient": "Ivuriro ryahagaritse gutegereza umurwayi",
  "Waited more than 2 minutes for an agent": "Yategereje umukozi w'ubuzima iminota irenze 2",
  "Waited more than 5 minutes for an agent": "Yategereje umukozi w'ubuzima iminota irenze 5",
  "The administrator was alerted": "Umuyobozi yamenyeshejwe",
  "You": "Wowe",
  "A pharmacy": "Farumasi",
  "UbuzimaConnect": "UbuzimaConnect",
  "Automatic": "Byikora",
  "Someone not logged in": "Umuntu utinjiye",
  "Patient": "Umurwayi",
  "Health agent": "Umukozi w'ubuzima",
  "Clinician": "Umuganga",
  "Facility manager": "Umuyobozi w'ivuriro",
  "System administrator": "Umuyobozi wa sisitemu",
  // System messages in the chat
  "Another agent will continue with you.": "Undi mukozi w'ubuzima azakomezanya nawe.",
  "Your agent was called to an emergency. Another agent will continue.": "Umukozi w'ubuzima wawe yahamagariwe ubutabazi bwihutirwa. Undi azakomeza.",
  "The patient said they no longer need help. The case is closed.": "Umurwayi yavuze ko atagikeneye ubufasha. Ubusabe bwafunzwe.",
  "We tried to call you 3 times without an answer. Tap “Prefer a call” again when you can talk, or call 912 in an emergency.":
    "Twaguhamagaye inshuro 3 ntiwitaba. Ongera ukande “Ndashaka guhamagarwa” igihe ushobora kuvuga, cyangwa uhamagare 912 niba byihutirwa.",
};

/** System messages with a value in them (a name, a facility, a code). */
const RW_PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^(.+), a health agent, is now looking at your request\.$/, (n) => `${n}, umukozi w'ubuzima, ari kureba ubusabe bwawe.`],
  [/^Go to (.+?)( \((.+)\))?\. They are expecting you for the next 24 hours\.$/, (f, _p, phone) => `Jya kuri ${f}${phone ? ` (${phone})` : ""}. Barakwitezeho mu masaha 24 ari imbere.`],
  [/^A prescription was issued: (\S+)\. Show this code at any pharmacy within 7 days\. It is also in your records\.$/, (c) => `Wandikiwe imiti: ${c}. Erekana iyi kode kuri farumasi iyo ari yo yose mu minsi 7. Iri no mu makuru y'ubuzima bwawe.`],
  [/^(.+) can't receive you right now\. A health agent will choose another place for you\. If you get worse, call 912\.$/, (f) => `${f} ntishobora kukwakira ubu. Umukozi w'ubuzima azaguhitiramo ahandi. Nurushaho kumererwa nabi, hamagara 912.`],
];

/** Shows a server or validation sentence in the patient's language; unknown sentences stay as they are. */
export function translate(lang: Lang, text: string) {
  if (lang === "en" || !text) return text;
  if (RW[text]) return RW[text];
  for (const [re, make] of RW_PATTERNS) {
    const m = text.match(re);
    if (m) return make(...m.slice(1));
  }
  return text;
}

/** Every English sentence above, for the review sheet. */
export const SENTENCES_FOR_REVIEW = { exact: RW, patterns: RW_PATTERNS.map(([re]) => re.source) };
