## Julkul – lyckohjul för julkalendern

Ett hjul som slumpar fram vem som får öppna dagens lucka. Byggt för att köras i webbläsaren på en TV, men fungerar även på dator och mobil.

### Så används det
- **Snurra:** tryck på *Snurra!*, på hjulet eller på OK/Enter.
- **Vinnaren** visas i stor text. *Spara vinnaren* sparar och tar bort personen ur hjulet. *Snurra om* drar på nytt utan att spara.
- **Lucka:** sätts automatiskt till dagens datum (1–24 december). Byt med ◀ ▶ eller vänster- och högerpil, till exempel för helgluckor.
- **Borta idag:** tryck på ett namn i listan. Det gäller bara idag.
- **Gäst:** skriv ett namn och tryck +. Gäster är med bara idag.
- **Vinnare hittills:** tryck på en rad för att ta bort en felaktig vinnare.
- När alla har vunnit en gång är alla med i hjulet igen.
- Utanför 1–24 december körs en **testdragning**, och då sparas ingenting.

### Ändra deltagare
Redigera `names.json` och pusha till `main`. Siten uppdateras automatiskt via GitHub Actions.

### Testa ett visst datum
Lägg till `?datum=2026-12-05` sist i adressen.

### Var sparas vinnarna?
I webbläsarens lagring (localStorage) på den enhet där man snurrar, alltså TV:n. Byter ni enhet följer historiken inte med.
