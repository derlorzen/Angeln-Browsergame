// Texte für Anleitung, Hintergrund und Netzwerk-Erklärung.
import { RULES } from '../data/defs';
import { MAP_IDS, MAP_INFO } from '../sim/map';

export const BACKGROUND_HTML = `
<h2>Hintergrund</h2>
<div class="text">
<p><b>Angeln, um 1600.</b> Zwischen Schlei und Flensburger Förde liegt die Landschaft Angeln: Felder, die von Knicks
– bewachsenen Erdwällen – gegliedert werden, kleine Wälder, Dörfer mit Reetdächern und Fachwerk. Kappeln an der
Schlei lebt vom Fischfang; sein Heringszaun, eine stationäre Fangvorrichtung aus trichterförmigen Flechtzäunen, ist bis
heute erhalten. Im Binnenland liegt Süderbrarup mit dem Brarup-Markt, nahebei das Thorsberger Moor, ein bedeutender
archäologischer Fundplatz. Die Schlei selbst ist kein Fluss, sondern ein schmaler Meeresarm der Ostsee.</p>
<p>Im Spiel ringen zwei Siedlungen um Fischgründe, Handel und die Wege zu einem neutralen Markt – auf sechs Karten
zwischen Rendsburg an der Eider und Esbjerg in Südwestjütland.</p>
<h3>Die Karten</h3>
<ul>
${MAP_IDS.map((m) => `<li><b>${MAP_INFO[m].name}</b> (${MAP_INFO[m].region}): ${MAP_INFO[m].desc}<br><span class="note"><i>Freiheiten:</i> ${MAP_INFO[m].liberties}</span></li>`).join('\n')}
</ul>
<p class="note">Die Lage der Orte und Seen wurde mit dem TomTom-Kartendienst geprüft und korrigiert, ebenso der
Verlauf der Flensburger Förde und die Küste von Eiderstedt und Husum. Flussläufe und die dänische Küste beruhen auf
allgemeinem Kartenwissen. Jede Karte wird maßstabstreu (Norden oben) in die Spielfläche eingepasst. Anschließend gleicht das Spiel
Wege, Holz, Acker, Lehm und Fischgründe der beiden Startplätze aus: Markt und Fundstelle werden so verschoben, dass
beide Seiten etwa gleich weit laufen, Waldstücke und Ackerland werden angeglichen, und Startplätze ohne Ufer erhalten
einen Fischteich. Dadurch weichen einzelne Orte von ihrer echten Lage ab.</p>
<h3>Die Parteien – mit einem Augenzwinkern</h3>
<p>Die vier Parteien sind bewusst klischeehaft überzeichnet und sollen niemanden ernsthaft beschreiben:</p>
<ul>
<li><b>Angeliter</b> – wortkarge Bauern zwischen Knicks, Apfelbäumen und Angler Rotvieh („Wat mutt, dat mutt.“).
Fachwerk mit roter Ausfachung, Reetdächer. Spezialeinheit: Knickwächter mit Sense.</li>
<li><b>Schwansener</b> – Gutsherren vom Südufer der Schlei mit weißen Herrenhäusern, Alleen und edlen Pferden;
handelsstark. Spezialeinheit: Gutsreiter. (Die tatsächliche Gutsherrschaft samt Leibeigenschaft war für die
Landbevölkerung alles andere als romantisch – das Spiel verkürzt hier stark.)</li>
<li><b>Nordfriesen</b> – Küstenleute aus den Uthlanden mit Haubarg und Friesenhaus, Hering und Schafen; ihr
Freiheitsspruch „Lewwer duad üs Slaav!“ ist durch Liliencrons Ballade „Pidder Lüng“ bekannt (19. Jh.).
Spezialeinheit: Grabenspringer mit Springstock.</li>
<li><b>Dänen</b> – die Amtsleute der Krone mit Backstein-Renaissance, grünen Kupferhelmen und rot-weißen Fahnen.
Spezialeinheit: Musketier mit Gabel.</li>
</ul>
<h3>Erfundenes und zeitliche Freiheiten</h3>
<ul>
<li><b>Der Konflikt ist erfunden.</b> Eine Fehde zwischen Kappeln und Arnis um den Brarup-Markt hat es nicht gegeben.
Kasernen, Landsknechte und Gefechte sind Spielmechanik. Um 1600 gehörte das Herzogtum Schleswig zum dänischen
Machtbereich (König bzw. Gottorfer Herzöge); einen Krieg zwischen Angelitern, Schwansenern, Friesen und Dänen gab es so nicht.
Jede Partei kann jeden Startplatz besetzen.</li>
<li><b>Bauformen:</b> Haubarge entstanden vor allem ab dem 17. Jahrhundert in Eiderstedt; weiß verputzte
Herrenhäuser in dieser Form sind meist jünger. Musketen mit Gabel passen dagegen gut in die Zeit um 1600.</li>
<li><b>Arnis</b> wurde erst 1667 von Kappelner Familien gegründet. Im Spiel besteht es bereits um 1600.</li>
<li><b>Thorsberger Moor:</b> Die eisenzeitlichen Opferfunde (u. a. der Thorsberger Prachtmantel) wurden erst im
19. Jahrhundert ausgegraben (v. a. 1858–1861). Im Spiel melden Torfstecher „alte Funde“; die Erkundung bringt Ansehen
beim Landesherrn – ohne erfundene Legenden oder übernatürliche Kräfte.</li>
<li><b>Mühle:</b> Kappelns Mühle Amanda wurde erst 1888 gebaut. Das Spiel zeigt stattdessen eine hölzerne Bockwindmühle,
wie sie um 1600 verbreitet war.</li>
<li><b>Karte „Die Schlei“:</b> Lage und Abstände von Kappeln, Arnis, Süderbrarup, Moor und Schlei sind stark vereinfacht und nicht
maßstabsgetreu. Das Ostufer (Schwansen) ist nur Kulisse. Die Kirche am Brarup-Markt ist ein freies Motiv.</li>
<li><b>Wirtschaft:</b> Taler, Prestige, Preise und Produktionsraten sind für die Spielbarkeit erfunden.</li>
<li><b>Zeitalter:</b> Der Sprung vom 18. ins 20. Jahrhundert überspringt das 19. bewusst; Gebäude, Einheiten und Forschungen
sind vereinfachte Sinnbilder ihrer Epoche. Das 22. Jahrhundert (Fusionsenergie, Vertikalfarmen, Drohnen, Kraftanzüge)
ist reine Zukunftsfantasie.</li>
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
${RULES.prestigeGoalDefault} Prestige durch Handel (wirtschaftlicher Sieg; Ziel im Spielaufbau einstellbar, auch „aus“).</p>
<p><b>Parteien:</b> <b>Angeliter</b> (Landwirtschaft, Knickwächter), <b>Schwansener</b> (Handel, Gutsreiter),
<b>Nordfriesen</b> (Fischerei, Grabenspringer – überspringen Knicks), <b>Dänen</b> (Militär, Musketiere).
Jede Partei baut in eigenem Stil und hat eigene Boni; Details zeigt die Parteiwahl.</p>
<p><b>Rohstoffe:</b> Holz, Getreide, Fisch, Lehm, Waren, Taler. Bevölkerung begrenzt Arbeiter und Soldaten – Wohnhäuser
erhöhen die Grenze.</p>
<ul>
<li><b>Holz:</b> Arbeiter per Rechtsklick auf Bäume schicken; sie liefern am Dorfzentrum oder Holzfällerlager ab.</li>
<li><b>Getreide:</b> Bauernhof bauen; er legt Felder an. Arbeiter per Rechtsklick zuweisen (max. 3).</li>
<li><b>Lehm:</b> Lehmgrube auf braunem Lehmboden, Arbeiter zuweisen.</li>
<li><b>Fisch:</b> Heringszaun am Ufer (Meer, Fluss, See, Watt oder Fischteich) – fängt selbstständig.</li>
<li><b>Waren:</b> Bockmühle (4 Getreide → 3 Waren) und Räucherei (3 Fisch + 1 Holz → 2 Waren).</li>
<li><b>Taler &amp; Prestige:</b> Waren am eigenen Markt verkaufen. Wer den <b>neutralen Markt</b> (⚑; je nach Karte z. B.
Brarup-Markt, Flensburger Markt oder Ochsenmarkt Ribe) allein mit Einheiten besetzt, erhält mehr Taler, doppeltes
Prestige je Verkauf und laufend Prestige. <i>Besetzen:</i> Einheiten wählen und den Markt rechts anklicken – sie stellen
sich in den gestrichelten Kreis. Er gehört euch, solange nur eure Einheiten darin stehen; ein Klick auf ⚑ oben zeigt ihn.</li>
<li><b>Fundstelle:</b> (je nach Karte z. B. Thorsberger Moor, Haithabu oder Grabhügel auf der Heide) Die erste Einheit
an der Fundstelle („?“) bringt einmalig ${RULES.moorReward.prestige} Prestige und ${RULES.moorReward.taler} Taler.</li>
</ul>
<p><b>Lager:</b> Außer Talern passt jeder Rohstoff nur bis zur Lagergrenze (oben „Vorrat/Grenze“). Mehr Platz bringen
Speicher (Arbeiter, Taste C) und der Ausbau des Dorfzentrums. Volle Lager: Überschuss verfällt, Höfe ruhen.</p>
<p><b>Verarbeitung:</b> Mühle &amp; Co. verbrauchen Getreide bzw. Fisch selbstständig, lassen aber 40 Getreide bzw. 30 Fisch
übrig. „Anhalten“ (Q) am Gebäude stoppt den Verbrauch ganz.</p>
<p><b>Abreißen:</b> Gebäude wählen und „Abreißen“ (V oder Entf) zweimal drücken: Die Hälfte der Baukosten kommt zurück.</p>
<p><b>Bauen:</b> Gebäude werden von Arbeitern errichtet und arbeiten erst nach Fertigstellung. Gebaut werden darf nur
nahe eigener fertiger Gebäude. Kosten, Bauzeit und Voraussetzungen zeigt der Tooltip jedes Bauknopfs.</p>
<p><b>Ausbau:</b> Fertige Gebäude lassen sich zweimal ausbauen (Knopf „Stufe II/III“, Taste C): mehr Ertrag, schnellere
Verarbeitung oder Ausbildung, mehr Wohnraum oder Lebenspunkte. Stufe II/III setzt ein Dorfzentrum derselben Stufe voraus,
Stufe III des Dorfzentrums einen Markt. Das Gebäude arbeitet während des Ausbaus weiter.</p>
<p><b>Zeitalter:</b> Im Dorfzentrum (Taste A) steigt die Siedlung vom 17. ins 18., 20. und schließlich 22. Jahrhundert
auf. Jeder Aufstieg kostet Rohstoffe und Zeit und verlangt zwei fertige Gebäude der Vorepoche. Danach stehen neue
Gebäude (zweite Bauseite der Arbeiter, Taste V), neue Einheiten in der Kaserne und neue Forschungen bereit; ab dem
20. Jahrhundert ändern Dorfzentrum, Wohnhäuser, Kaserne und Markt ihr Aussehen. Kampfdrohnen fliegen über Wasser,
Knicks und Deiche hinweg.</p>
<p><b>Forschungen:</b> Fast jedes Gebäude bietet Forschungen (Tasten A/S/D/F an der Befehlskarte), z. B. „Bessere Flügel“
an der Mühle oder „Lederwams“ in der Kaserne. Sie wirken einmalig und parteiweit.</p>
<p><b>Eigene Gebäude:</b> Jede Partei hat ein Gebäude, das nur sie bauen kann (Taste X bei den Arbeitern): Meierei
(Angeliter), Gestüt (Schwansener), Salzsiederei (Nordfriesen), Zollhaus (Dänen).</p>
<p><b>Reparieren:</b> Beschädigte Gebäude mit Arbeitern rechts anklicken oder am Gebäude „Reparieren“ (Taste X) wählen.
Kostet etwas Holz.</p>
<p><b>Untätige Arbeiter:</b> Die Anzeige 💤 oben zählt sie; Klick darauf oder Taste „.“ springt zum nächsten.</p>
<p><b>Mehrspieler:</b> „Spiel erstellen“ liefert einen Spielcode (z. B. K7M-2QX); bis zu drei Mitspieler geben ihn unter
„Mit Spielcode beitreten“ ein oder öffnen den Einladungslink. Freie Plätze kann die KI übernehmen, jede Partei darf
mehrfach vorkommen. Mit drei oder vier Spielern wird die Karte größer, jeder spielt gegen jeden.</p>
<p><b>Sichern:</b> Die Partie wird regelmäßig automatisch gesichert. Nach versehentlichem Schließen bietet das Hauptmenü
„Letzte Partie fortsetzen“ an.</p>
<p><b>Kampf:</b> Kaserne bildet Späher (schnell, weite Sicht), Landsknechte (Nahkampf, stark gegen Gebäude) und
Armbrustschützen (Fernkampf) aus. Untätige Soldaten verteidigen sich und ihre Umgebung automatisch, das Dorfzentrum
schießt auf nahe Feinde. Knicks versperren Weg und Sicht; Tore und Wege führen hindurch.</p>
<p><b>Gelände:</b> Gräben in der Marsch versperren den Weg, aber nicht die Sicht. Deiche und das Danewerk versperren Weg
und Sicht – nur Stöpen bzw. Tore führen hindurch. Watt ist begehbar, aber sehr langsam; Moor verlangsamt, Wege
beschleunigen. Die Grabenspringer der Nordfriesen setzen über Knicks und Gräben.</p>
<p>Ausführliche Steuerung: im Spiel mit <b>F1</b>. Der <b>Lehrmeister</b> (F2) führt Schritt für Schritt durch die erste Partie.</p>
</div>`;

export const NETWORK_HTML = `
<h3>Wie die direkte Verbindung funktioniert</h3>
<div class="text note">
<p><b>Spielcode:</b> Der Server, der das Spiel ausliefert, vermittelt nur den Verbindungsaufbau (Angebot und Antwort,
wenige Kilobyte). Danach läuft die Partie direkt zwischen den Browsern; der Server sieht keine Spielzüge und speichert
nichts.</p>
<p><b>Ohne Server</b> (rein statisches Hosting) tauscht ihr Einladungs- und Antwortcode selbst aus, z. B. per Messenger.
Diese Codes sind lang, weil sie die vollständige Verbindungsbeschreibung enthalten.</p>
<p><b>STUN</b> hilft jedem Browser, seine von außen sichtbare Adresse zu ermitteln. Das ist ein externer Dienst
(standardmäßig ein öffentlicher STUN-Server), der keine Spieldaten sieht. Er ist abschaltbar.</p>
<p><b>TURN</b> wäre ein Relay, das Daten weiterleitet, wenn keine direkte Verbindung möglich ist. Es ist <b>nicht</b>
voreingestellt; optional kann ein eigener TURN-Server eingetragen werden.</p>
<p><b>Ohne ICE-Dienste</b> werden nur lokale Adressen verwendet: Das funktioniert meist nur auf demselben Gerät oder im
selben Heimnetz.</p>
<p>Direktes WebRTC funktioniert nicht durch jedes NAT und jede Firewall (z. B. manche Mobilfunk- oder Firmennetze).
Scheitert die Verbindung, zeigt das Spiel eine Meldung – eine universelle Verbindbarkeit kann nicht versprochen werden.</p>
<p><b>Vertrauen:</b> Der Browser des Erstellers (Host) berechnet die Partie und prüft alle Befehle der Mitspieler. Sie
können daher nicht schummeln – gegen Manipulation durch den Host gibt es in dieser Architektur jedoch keine unabhängige Kontrolle.</p>
</div>`;
