'use strict';
const crypto = require('node:crypto');

const ANNOUNCEMENT_CATEGORIES = { info: 'Information', travaux: 'Travaux', urgent: 'Urgent', vie: 'Vie de la résidence' };
const DOCUMENT_CATEGORIES = {
  ag: "Procès-verbaux d'AG",
  reglement: 'Règlement de copropriété',
  comptes: 'Comptes & budget',
  contrats: 'Contrats & prestataires',
  travaux: 'Travaux & devis',
  divers: 'Divers',
};
const TICKET_CATEGORIES = {
  plomberie: 'Plomberie / fuite',
  electricite: 'Électricité / éclairage',
  ascenseur: 'Ascenseur',
  proprete: 'Propreté / ordures',
  acces: 'Accès / interphone / portail',
  espaces_verts: 'Espaces verts',
  nuisances: 'Nuisances',
  autre: 'Autre',
};
const PRIORITIES = { basse: 'Basse', normale: 'Normale', haute: 'Haute' };
const TICKET_STATUSES = { ouvert: 'Ouvert', en_cours: 'En cours', resolu: 'Résolu' };
const EVENT_KINDS = { ag: 'Assemblée générale', conseil: 'Conseil syndical', travaux: 'Travaux / intervention', vie: 'Vie de la résidence', autre: 'Autre' };

const toDate = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).length > 10 && !/Z|[+-]\d\d:?\d\d$/.test(s) ? 'Z' : '')) : null);

function date(s) {
  const d = toDate(s);
  return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Casablanca' }) : '';
}
function dateTime(s) {
  const d = toDate(s);
  return d ? d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' }) : '';
}
// Les événements sont saisis en heure locale (Maroc) : on les affiche tels quels.
function eventDate(s) {
  const d = new Date(String(s).replace(' ', 'T'));
  return {
    day: d.getDate(),
    month: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    weekday: d.toLocaleDateString('fr-FR', { weekday: 'long' }),
    full: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: String(s).slice(11, 16).replace(':', 'h'),
  };
}
function money(cents) {
  // Dirham marocain, affiché « 1 200,00 DH ».
  return `${(Number(cents || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
}
function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}
function initials(u) {
  return `${(u.first_name || '?')[0]}${(u.last_name || '')[0] || ''}`.toUpperCase();
}
function isOverdue(c) {
  return !c.paid && c.due_date < new Date().toISOString().slice(0, 10);
}
// Mot de passe temporaire lisible (sans caractères ambigus).
function generatePassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) { out += alphabet[bytes[i] % alphabet.length]; if (i === 3 || i === 7) out += '-'; }
  return out;
}

module.exports = {
  ANNOUNCEMENT_CATEGORIES, DOCUMENT_CATEGORIES, TICKET_CATEGORIES, PRIORITIES, TICKET_STATUSES, EVENT_KINDS,
  date, dateTime, eventDate, money, fileSize, initials, isOverdue, generatePassword,
};
