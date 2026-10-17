/* ============================================================
   Alixo — fil d'exécution dédié à l'IA sur l'appareil (1.36.4)
   ------------------------------------------------------------
   Ce fichier est lancé par js/ailocal.js dans un Web Worker (module). Le moteur WebLLM — lecture des poids,
   compilation des programmes graphiques, calcul du modèle — tourne donc ici, hors du fil de l'interface :
   l'application reste fluide pendant qu'on charge le modèle ou qu'il rédige une réponse.
   Le worker ne fait que relayer les messages du moteur (protocole WebWorkerMLCEngineHandler de WebLLM) ; il
   se présente d'abord à ailocal.js (« alixo-ready »), qui se rabat sur le fil principal si le worker n'a pas
   accès à WebGPU.
   ============================================================ */
import { WebWorkerMLCEngineHandler } from './vendor/web-llm.js';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = e => handler.onmessage(e);
self.postMessage({ kind: 'alixo-ready', gpu: !!(self.navigator && self.navigator.gpu) });
