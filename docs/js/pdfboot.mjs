/* ============================================================
   Alixo — 1.56.0 : chargement de pdf.js (seul module ES de l'application)
   pdf.js 6 n'existe qu'en module ES : ce petit module l'importe, règle l'adresse de son worker (fichier vendu,
   jamais de « fake worker » dans la page) et l'expose aux scripts classiques (window.pdfjsLib), puis prévient
   par l'événement « pdfjs-ready ». Les modules sont différés : il s'exécute APRÈS tous les scripts classiques,
   qui attendent donc AlixoPdf.ready() (js/pdfview.js) avant toute utilisation.
   ============================================================ */
import * as pdfjsLib from './vendor/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
window.pdfjsLib = pdfjsLib;
document.dispatchEvent(new Event('pdfjs-ready'));
