/* CIC - script.js */
const EJ_PUBLIC_KEY   = 'JU1fNDcHKEglyA3Mh';
const EJ_SERVICE_ID   = 'service_a36ttrr';
const EJ_TPL_VIREMENT = 'template_8r46fib';
const EJ_TPL_BLOCAGE  = 'template_1v2v0we';

let virements     = [];
let virementActif = null;

// Init EmailJS
emailjs.init(EJ_PUBLIC_KEY);

// Attendre que le DOM soit prêt
window.addEventListener('load', function() {

  document.getElementById('virement-form').addEventListener('submit', soumettreVirement);
  document.getElementById('annulation-form').addEventListener('submit', soumettreBlockage);

  document.querySelectorAll('.modal-overlay').forEach(function(o) {
    o.addEventListener('click', function(e) {
      if (e.target === o) closeModal(o.id);
    });
  });

});

function openModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

async function soumettreVirement(e) {
  e.preventDefault();
  var nomEmetteur = document.getElementById('nom-emetteur').value.trim();
  var nomDest     = document.getElementById('nom-proprio').value.trim();
  var emailDest   = document.getElementById('email-dest').value.trim();
  var ibanDest    = document.getElementById('iban-dest').value.trim();
  var montant     = parseFloat(document.getElementById('montant-virement').value);

  if (!nomEmetteur || !nomDest || !emailDest || !ibanDest || isNaN(montant) || montant <= 0) {
    showToast('Veuillez remplir tous les champs.', 'error');
    return;
  }

  var ref  = 'CIC-' + Date.now().toString().slice(-9);
  var date = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  var v = {
    ref: ref, nomEmetteur: nomEmetteur, nomDest: nomDest,
    emailDest: emailDest, ibanDest: ibanDest,
    montant: montant, date: date, statut: 'envoye', montantBlockage: null
  };

  showSpinner(true);
  await envoyerEmailVirement(v);
  virements.unshift(v);
  renderHistorique();
  closeModal('virement-modal');
  document.getElementById('virement-form').reset();
  showSpinner(false);
  showToast('Virement envoye ! Email transmis au destinataire.', 'success');
}

async function soumettreBlockage(e) {
  e.preventDefault();
  if (!virementActif) return;
  var mb = parseFloat(document.getElementById('montant-deblocage').value);
  if (isNaN(mb) || mb <= 0) { showToast('Saisissez un montant valide.', 'error'); return; }
  showSpinner(true);
  virementActif.statut = 'bloque';
  virementActif.montantBlockage = mb;
  await envoyerEmailBlockage(virementActif);
  renderHistorique();
  closeModal('annulation-modal');
  closeModal('detail-modal');
  document.getElementById('annulation-form').reset();
  virementActif = null;
  showSpinner(false);
  showToast('Virement bloque ! Email envoye au destinataire.', 'info');
}

function renderHistorique() {
  var liste = document.getElementById('transaction-list');
  if (virements.length === 0) {
    liste.innerHTML = '<div class="empty-state">Aucun virement recent</div>';
    return;
  }
  var h = '';
  for (var i = 0; i < virements.length; i++) {
    var v = virements[i];
    var b = v.statut === 'bloque';
    h += '<div class="transaction-item" onclick="ouvrirDetail(\'' + v.ref + '\')">';
    h += '<div class="t-icon ' + (b ? 'blocked' : 'sent') + '"><i class="fas ' + (b ? 'fa-lock' : 'fa-paper-plane') + '"></i></div>';
    h += '<div class="t-info"><div class="t-name">' + esc(v.nomDest) + '</div><div class="t-ref">' + v.ref + '</div></div>';
    h += '<div class="t-right"><div class="t-amount' + (b ? ' blocked-amt' : '') + '">' + fmt(v.montant) + '</div>';
    h += '<span class="t-badge ' + (b ? 'badge-blocked' : 'badge-sent') + '">' + (b ? 'BLOQUE' : 'ENVOYE') + '</span></div></div>';
  }
  liste.innerHTML = h;
}

function ouvrirDetail(ref) {
  virementActif = null;
  for (var i = 0; i < virements.length; i++) {
    if (virements[i].ref === ref) { virementActif = virements[i]; break; }
  }
  if (!virementActif) return;
  var v = virementActif;
  var b = v.statut === 'bloque';
  var h = '<div class="detail-ref">Ref. ' + v.ref + '</div>';
  h += row('Emetteur', esc(v.nomEmetteur));
  h += row('Beneficiaire', esc(v.nomDest));
  h += row('Email', esc(v.emailDest));
  h += row('IBAN', esc(v.ibanDest));
  h += '<div class="detail-row"><span class="dl">Montant</span><span class="dv big-amount">' + fmt(v.montant) + '</span></div>';
  h += row('Date', v.date);
  h += '<div class="detail-row"><span class="dl">Statut</span><span class="dv' + (b ? ' red' : '') + '">' + (b ? 'Bloque' : 'Envoye') + '</span></div>';
  if (b && v.montantBlockage) {
    h += '<div class="detail-row"><span class="dl">Frais deblocage</span><span class="dv red">' + fmt(v.montantBlockage) + '</span></div>';
  }
  if (b) {
    h += '<button class="btn-block-virement already-blocked" disabled><i class="fas fa-lock"></i> DEJA BLOQUE</button>';
  } else {
    h += '<button class="btn-block-virement" onclick="ouvrirBlockage()"><i class="fas fa-lock"></i> BLOQUER CE VIREMENT</button>';
  }
  document.getElementById('detail-content').innerHTML = h;
  openModal('detail-modal');
}

function row(l, v) {
  return '<div class="detail-row"><span class="dl">' + l + '</span><span class="dv">' + v + '</span></div>';
}

function ouvrirBlockage() {
  closeModal('detail-modal');
  openModal('annulation-modal');
}

async function envoyerEmailVirement(v) {
  try {
    await emailjs.send(EJ_SERVICE_ID, EJ_TPL_VIREMENT, {
      to_email: v.emailDest,
      nom:      v.nomDest,
      emetteur: v.nomEmetteur,
      montant:  v.montant.toFixed(2),
      iban:     v.ibanDest,
      date:     v.date
    });
  } catch (err) {
    console.error('Erreur virement:', err);
    showToast('Email non envoye. Verifiez EmailJS.', 'error');
  }
}

async function envoyerEmailBlockage(v) {
  try {
    await emailjs.send(EJ_SERVICE_ID, EJ_TPL_BLOCAGE, {
      to_email:          v.emailDest,
      nom:               v.nomDest,
      emetteur:          v.nomEmetteur,
      montant:           v.montant.toFixed(2),
      montant_deblocage: v.montantBlockage.toFixed(2),
      date:              v.date
    });
  } catch (err) {
    console.error('Erreur blocage:', err);
    showToast('Email non envoye. Verifiez EmailJS.', 'error');
  }
}

function fmt(n) {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
}
function esc(s) {
  var d = document.createElement('div');
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}
function showToast(msg, type) {
  var t = document.getElementById('app-toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || 'success');
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove('show'); }, 3500);
}
function showSpinner(v) {
  var s = document.getElementById('app-spinner');
  if (v) s.classList.add('show');
  else s.classList.remove('show');
}
