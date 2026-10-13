// Texte für Anleitung, Hintergrund und Netzwerk-Erklärung.
import { RULES } from '../data/defs';

export const BACKGROUND_HTML = `
<h2>Hintergrund</h2>
<div class="text">
<p><b>Angeln, um 1600.</b> Zwischen Schlei und Flensburger Förde liegt die Landschaft Angeln: Felder, die von Knicks
– bewachsenen Erdwällen – gegliedert werden, kleine Wälder, Dörfer mit Reetdächern und Fachwerk. Kappeln an der
Schlei lebt vom Fischfang; sein Heringszaun, eine stationäre Fangvorrichtung aus trichterförmigen Flechtzäunen, ist bis
heute erhalten. Im Binnenland liegt Süderbrarup mit dem Brarup-Markt, nahebei das Thorsberger Moor, ein bedeutender
archäologischer Fundplatz. Die Schlei selbst ist kein Fluss, sondern ein schmaler Meeresarm der Ostsee.</p>
<p>Im Spiel ringen zwei Siedlungen an der Schlei um Fischgründe, Handel und die Wege zum Markt in Süderbrarup.</p>
<h3>Erfundenes und zeitliche Freiheiten</h3>
<ul>
<li><b>Der Konflikt ist erfunden.</b> Eine Fehde zwischen Kappeln und Arnis um den Brarup-Markt hat es nicht gegeben.
Kasernen, Landsknechte und Gefechte sind Spielmechanik.</li>
<li><b>Arnis</b> wurde erst 1667 von Kappelner Familien gegründet. Im Spiel besteht es bereits um 1600.</li>
<li><b>Thorsberger Moor:</b> Die eisenzeitlichen Opferfunde (u. a. der Thorsberger Prachtmantel) wurden erst im
19. Jahrhundert ausgegraben (v. a. 1858–1861). Im Spiel melden Torfstecher „alte Funde“; die Erkundung bringt Ansehen
beim Landesherrn – ohne erfundene Legenden oder übernatürliche Kräfte.</li>
<li><b>Mühle:</b> Kappelns Mühle Amanda wurde erst 1888 gebaut. Das Spiel zeigt stattdessen eine hölzerne Bockwindmühle,
wie sie um 1600 verbreitet war.</li>
<li><b>Karte:</b> Lage und Abstände von Kappeln, Arnis, Süderbrarup, Moor und Schlei sind stark vereinfacht und nicht
maßstabsgetreu. Das Ostufer (Schwansen) ist nur Kulisse. Die Kirche am Brarup-Markt ist ein freies Motiv.</li>
<li><b>Wirtschaft:</b> Taler, Prestige, Preise und Produktionsraten sind für die Spielbarkeit erfunden.</li>
</ul>
<h3>Quellen</h3>
<ul class="note">
<li>Heringszaun Kappeln: <a href="https://www.kappeln.de/Unsere-Stadt/Mitteilungen/Erneuerung-des-Heringszaunes.php?FID=2989.68974.1&amp;ModID=255" target="_blank" rel="noopener">kappeln.de – Erneuerung des Heringszaunes</a></li>
<li>Süderbrarup, Brarup-Markt, Thorsberger Moor: <a href="https://www.amt-suederbrarup.de/gemeinden/suederbrarup" target="_blank" rel="noopener">amt-suederbrarup.de</a></li>
<li>Knicks: <a href="https://www.schleswig-holstein.de/DE/landesregierung/ministerien-behoerden/V/Service/Broschueren/Broschueren_V/Umwelt/pdf/broschuereKnickschutz" target="_blank" rel="noopener">Land Schleswig-Holstein – Broschüre Knickschutz</a></li>
<li>Mühle Amanda: <a href="https://www.touristikverein-kappeln.de/urlaub-in-kappeln/rundgang/die-muehle-amanda.html" target="_blank" rel="noopener">touristikverein-kappeln.de</a></li>
</ul>
</div>`;

export const GUIDE_HTML = `
<h2>Spielanleitung</h2>
<div class="text">
<p><b>Ziel:</b> Zerstört das gegnerische Dorfzentrum (militärischer Sieg) <i>oder</i> erreicht als Erster
${RULES.prestigeGoalDefault} Prestige durch Handel (wirtschaftlicher Sieg; Ziel im Spielaufbau einstellbar).</p>
<p><b>Rohstoffe:</b> Holz, Getreide, Fisch, Lehm, Waren, Taler. Bevölkerung begrenzt Arbeiter und Soldaten – Wohnhäuser
erhöhen die Grenze.</p>
<ul>
<li><b>Holz:</b> Arbeiter per Rechtsklick auf Bäume schicken; sie liefern am Dorfzentrum oder Holzfällerlager ab.</li>
<li><b>Getreide:</b> Bauernhof bauen; er legt Felder an. Arbeiter per Rechtsklick zuweisen (max. 3).</li>
<li><b>Lehm:</b> Lehmgrube auf braunem Lehmboden, Arbeiter zuweisen.</li>
<li><b>Fisch:</b> Heringszaun am Ufer der Schlei – fängt selbstständig.</li>
<li><b>Waren:</b> Bockmühle (4 Getreide → 3 Waren) und Räucherei (3 Fisch + 1 Holz → 2 Waren).</li>
<li><b>Taler &amp; Prestige:</b> Waren am eigenen Markt verkaufen. Wer den <b>Brarup-Markt</b> in Süderbrarup allein mit
Einheiten besetzt, erhält mehr Taler, doppeltes Prestige je Verkauf und laufend Prestige.</li>
<li><b>Thorsberger Moor:</b> Die erste Einheit an der Fundstelle („?“) bringt einmalig ${RULES.moorReward.prestige} Prestige und ${RULES.moorReward.taler} Taler.</li>
</ul>
<p><b>Bauen:</b> Gebäude werden von Arbeitern errichtet und arbeiten erst nach Fertigstellung. Gebaut werden darf nur
nahe eigener fertiger Gebäude. Kosten, Bauzeit und Voraussetzungen zeigt der Tooltip jedes Bauknopfs.</p>
<p><b>Kampf:</b> Kaserne bildet Späher (schnell, weite Sicht), Landsknechte (Nahkampf, stark gegen Gebäude) und
Armbrustschützen (Fernkampf) aus. Untätige Soldaten verteidigen sich und ihre Umgebung automatisch, das Dorfzentrum
schießt auf nahe Feinde. Knicks versperren Weg und Sicht; Tore und Wege führen hindurch.</p>
<p>Ausführliche Steuerung: im Spiel mit <b>F1</b>. Der <b>Lehrmeister</b> (F2) führt Schritt für Schritt durch die erste Partie.</p>
</div>`;

export const NETWORK_HTML = `
<h3>Wie die direkte Verbindung funktioniert</h3>
<div class="text note">
<p><b>Statisches Hosting</b> liefert nur die Spieldateien aus. Es simuliert keine Partien und speichert keine Spielstände.</p>
<p><b>Signaling</b> ist der Austausch der Verbindungsbeschreibungen (Angebot und Antwort). Hier geschieht das
<b>manuell</b>: Ihr kopiert Einladungs- und Antwortcode selbst, z. B. per Messenger. Es gibt keinen Vermittlungsserver.
Die Codes sind lang, weil sie die vollständige Beschreibung enthalten – ein kurzer Code könnte die Gegenstelle ohne
Vermittlung nicht finden.</p>
<p><b>STUN</b> hilft jedem Browser, seine von außen sichtbare Adresse zu ermitteln. Das ist ein externer Dienst
(standardmäßig ein öffentlicher STUN-Server), der keine Spieldaten sieht. Er ist abschaltbar.</p>
<p><b>TURN</b> wäre ein Relay, das Daten weiterleitet, wenn keine direkte Verbindung möglich ist. Es ist <b>nicht</b>
voreingestellt; optional kann ein eigener TURN-Server eingetragen werden.</p>
<p><b>Ohne ICE-Dienste</b> werden nur lokale Adressen verwendet: Das funktioniert meist nur auf demselben Gerät oder im
selben Heimnetz.</p>
<p>Direktes WebRTC funktioniert nicht durch jedes NAT und jede Firewall (z. B. manche Mobilfunk- oder Firmennetze).
Scheitert die Verbindung, zeigt das Spiel eine Meldung – eine universelle Verbindbarkeit kann nicht versprochen werden.</p>
<p><b>Vertrauen:</b> Der Browser des Erstellers (Host) berechnet die Partie und prüft alle Befehle des Gastes. Der Gast
kann daher nicht schummeln – gegen Manipulation durch den Host gibt es in dieser Architektur jedoch keine unabhängige Kontrolle.</p>
</div>`;
