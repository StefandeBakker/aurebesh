/**
 * The emoji of the picker: some five hundred that are used every day, in eight groups, each with a name and some words to find it by,
 * in English and in Dutch (what is typed in the search is looked for in both). They are only characters: the HTML has the emoji itself,
 * so Markdown, plain text and Word documents have it too, and nothing has to be sanitized. A `+` after a character means that it
 * has skin tones.
 *
 * A line is `emoji|English name|English words|Dutch name|Dutch words`.
 */
const DATA: Array<[id: string, icon: string, lines: string]> = [
  [
    'smileys',
    '😀',
    `😀|grinning face|happy smile|brede lach|blij lachen
😃|grinning face with big eyes|happy smile joy|lachend gezicht|blij vrolijk
😄|grinning face with smiling eyes|happy joy laugh|lachend gezicht met lachende ogen|blij lach
😁|beaming face with smiling eyes|grin happy|stralend gezicht|grijns blij
😆|grinning squinting face|laugh lol|lachend met samengeknepen ogen|lol lachen
😅|grinning face with sweat|nervous relief|lachend met zweetdruppel|opluchting zweet
🤣|rolling on the floor laughing|rofl lol|rollend van het lachen|lol dubbel
😂|face with tears of joy|lol laugh cry|gezicht met vreugdetranen|lol lachen huilen
🙂|slightly smiling face|smile|licht glimlachend gezicht|glimlach
🙃|upside-down face|silly sarcasm|ondersteboven gezicht|gek sarcasme
😉|winking face|wink flirt|knipogend gezicht|knipoog
😊|smiling face with smiling eyes|blush happy|glimlachend gezicht|blozen blij
😇|smiling face with halo|angel innocent|glimlach met halo|engel onschuldig
🥰|smiling face with hearts|love adore|glimlach met hartjes|liefde verliefd
😍|smiling face with heart-eyes|love crush|gezicht met hartjesogen|verliefd liefde
🤩|star-struck|wow amazed|met sterretjes in de ogen|wauw verbaasd
😘|face blowing a kiss|kiss love|gezicht dat een kus blaast|kus liefde
😗|kissing face|kiss|kussend gezicht|kus
😚|kissing face with closed eyes|kiss|kussend gezicht met gesloten ogen|kus
😙|kissing face with smiling eyes|kiss|kussend gezicht met lachende ogen|kus
😋|face savoring food|yum tasty delicious|gezicht dat proeft|lekker smakelijk
😛|face with tongue|playful|gezicht met tong|plagen
😜|winking face with tongue|crazy joke|knipogen met tong|gek grapje
🤪|zany face|crazy wild|maf gezicht|gek wild
😝|squinting face with tongue|silly|samengeknepen ogen met tong|gek
🤑|money-mouth face|rich dollar|gezicht met geldmond|rijk geld
🤗|smiling face with open hands|hug|glimlach met open handen|knuffel
🤭|face with hand over mouth|oops giggle|gezicht met hand voor de mond|oeps giechel
🤫|shushing face|quiet secret|stilte gezicht|stil geheim
🤔|thinking face|hmm think|nadenkend gezicht|hmm denken
🤐|zipper-mouth face|secret quiet|gezicht met ritssluiting|geheim zwijgen
🤨|face with raised eyebrow|doubt suspicious|gezicht met opgetrokken wenkbrauw|twijfel wantrouwig
😐|neutral face|meh|neutraal gezicht|meh
😑|expressionless face|blank|uitdrukkingsloos gezicht|blanco
😶|face without mouth|silent speechless|gezicht zonder mond|stil sprakeloos
😏|smirking face|smug|grijnzend gezicht|zelfvoldaan
😒|unamused face|bored annoyed|ontevreden gezicht|verveeld
🙄|face with rolling eyes|eyeroll annoyed|gezicht met rollende ogen|zucht geïrriteerd
😬|grimacing face|awkward oops|grimas|ongemakkelijk oeps
🤥|lying face|liar pinocchio|liegend gezicht|leugenaar
😌|relieved face|calm|opgelucht gezicht|opluchting rustig
😔|pensive face|sad|bedachtzaam gezicht|verdrietig
😪|sleepy face|tired|slaperig gezicht|moe
🤤|drooling face|hungry|kwijlend gezicht|honger
😴|sleeping face|zzz sleep|slapend gezicht|slapen zzz
😷|face with medical mask|sick ill|gezicht met mondmasker|ziek
🤒|face with thermometer|sick fever|gezicht met thermometer|ziek koorts
🤕|face with head-bandage|hurt injury|gezicht met hoofdverband|pijn gewond
🤢|nauseated face|sick|misselijk gezicht|ziek
🤮|face vomiting|sick throw up|overgevend gezicht|kotsen
🤧|sneezing face|cold allergy|niezend gezicht|verkouden allergie
🥵|hot face|heat|oververhit gezicht|warm hitte
🥶|cold face|freezing|bevroren gezicht|koud
🥴|woozy face|drunk dizzy|beneveld gezicht|dronken duizelig
😵|face with crossed-out eyes|dizzy|gezicht met kruisjes als ogen|duizelig
🤯|exploding head|mind blown|ontploffend hoofd|verbijsterd
🤠|cowboy hat face|cowboy|gezicht met cowboyhoed|cowboy
🥳|partying face|party celebrate|feestend gezicht|feest vieren
😎|smiling face with sunglasses|cool|glimlach met zonnebril|cool
🤓|nerd face|geek|nerd gezicht|nerd
🧐|face with monocle|inspect curious|gezicht met monocle|onderzoeken
😕|confused face|puzzled|verward gezicht|verward
😟|worried face|anxious|bezorgd gezicht|ongerust
🙁|slightly frowning face|sad|licht fronsend gezicht|verdrietig
😮|face with open mouth|surprised|gezicht met open mond|verrast
😯|hushed face|surprised|verstomd gezicht|verrast
😲|astonished face|shocked|verbaasd gezicht|geschokt
😳|flushed face|embarrassed|blozend gezicht|beschaamd
🥺|pleading face|puppy eyes please|smekend gezicht|alsjeblieft
😦|frowning face with open mouth|shocked|fronsend gezicht met open mond|geschokt
😧|anguished face|stunned|angstig gezicht|ontsteld
😨|fearful face|scared|bang gezicht|angst
😰|anxious face with sweat|nervous|angstig gezicht met zweet|nerveus
😥|sad but relieved face|disappointed|verdrietig maar opgelucht|teleurgesteld
😢|crying face|tear sad|huilend gezicht|traan verdriet
😭|loudly crying face|sob|luid huilend gezicht|snikken
😱|face screaming in fear|scared shocked|gillend van angst|bang schrik
😖|confounded face|frustrated|verwarde gezicht|gefrustreerd
😣|persevering face|struggle|volhardend gezicht|worstelen
😞|disappointed face|sad|teleurgesteld gezicht|verdrietig
😓|downcast face with sweat|stress|neerslachtig gezicht met zweet|stress
😩|weary face|tired|vermoeid gezicht|moe
😫|tired face|exhausted|uitgeput gezicht|moe
🥱|yawning face|bored sleepy|geeuwend gezicht|saai slaperig
😤|face with steam from nose|triumph angry|gezicht met stoom uit neus|boos
😡|pouting face|angry mad|pruilend gezicht|boos woedend
😠|angry face|mad|boos gezicht|kwaad
🤬|face with symbols on mouth|swearing|gezicht met symbolen over de mond|vloeken
😈|smiling face with horns|devil|glimlach met hoorns|duivel
👿|angry face with horns|devil|boos gezicht met hoorns|duivel
💀|skull|dead death|schedel|dood
💩|pile of poo|poop|drol|poep
🤡|clown face|clown|clowngezicht|clown
👻|ghost|halloween boo|spook|halloween
👽|alien|ufo|alien|ruimtewezen
🤖|robot|bot|robot|bot
😺|grinning cat|cat happy|lachende kat|kat blij
😻|smiling cat with heart-eyes|cat love|kat met hartjesogen|kat verliefd
🙀|weary cat|cat scared|vermoeide kat|kat bang
😿|crying cat|cat sad|huilende kat|kat verdriet
🙈|see-no-evil monkey|monkey shy|aapje dat niets ziet|aap beschaamd
🙉|hear-no-evil monkey|monkey|aapje dat niets hoort|aap
🙊|speak-no-evil monkey|monkey|aapje dat niets zegt|aap`,
  ],
  [
    'people',
    '👋',
    `👋+|waving hand|hello hi bye|zwaaiende hand|hallo dag
🤚+|raised back of hand|stop|opgestoken hand van achteren|stop
🖐+|hand with fingers splayed|five high five|hand met gespreide vingers|vijf
✋+|raised hand|stop high five|opgestoken hand|stop
🖖+|vulcan salute|spock|vulcan groet|spock
👌+|ok hand|okay perfect|ok teken|oké prima
✌+|victory hand|peace|overwinningsteken|vrede
🤞+|crossed fingers|luck hope|gekruiste vingers|geluk hoop
🤟+|love-you gesture|love|ik hou van je gebaar|liefde
🤘+|sign of the horns|rock metal|rockgebaar|rock
🤙+|call me hand|phone shaka|bel mij hand|bellen
👈+|backhand index pointing left|left|wijsvinger naar links|links
👉+|backhand index pointing right|right|wijsvinger naar rechts|rechts
👆+|backhand index pointing up|up|wijsvinger omhoog|omhoog
👇+|backhand index pointing down|down|wijsvinger omlaag|omlaag
☝+|index pointing up|one|wijsvinger omhoog gestoken|een
👍+|thumbs up|like yes good approve|duim omhoog|leuk ja goed
👎+|thumbs down|dislike no bad|duim omlaag|niet leuk nee slecht
✊+|raised fist|power|gebalde vuist|kracht
👊+|oncoming fist|punch bump|vuist|stoot
🤛+|left-facing fist|fist bump|vuist naar links|vuist
🤜+|right-facing fist|fist bump|vuist naar rechts|vuist
👏+|clapping hands|applause bravo|klappende handen|applaus bravo
🙌+|raising hands|hooray celebrate|handen in de lucht|hoera vieren
👐+|open hands|hug|open handen|knuffel
🤲+|palms up together|pray|handen omhoog|bidden
🤝|handshake|deal agreement|handdruk|deal afspraak
🙏+|folded hands|please thanks pray|gevouwen handen|alsjeblieft dank bidden
✍+|writing hand|write|schrijvende hand|schrijven
💅+|nail polish|beauty|nagellak|schoonheid
💪+|flexed biceps|strong muscle|gespierde arm|sterk spier
🦵+|leg|kick|been|schop
🦶+|foot|kick|voet|schop
👂+|ear|hear listen|oor|horen luisteren
👃+|nose|smell|neus|ruiken
🧠|brain|smart mind|hersenen|slim brein
👀|eyes|look see|ogen|kijken zien
👁|eye|see|oog|zien
👅|tongue|taste|tong|proeven
👄|mouth|lips|mond|lippen
👶+|baby|child|baby|kind
🧒+|child|kid|kind|kleintje
👦+|boy|kid|jongen|kind
👧+|girl|kid|meisje|kind
🧑+|person|adult|persoon|volwassene
👨+|man|male|man|mannelijk
👩+|woman|female|vrouw|vrouwelijk
🧓+|older person|elderly|oudere persoon|bejaard
👴+|old man|grandfather|oude man|opa
👵+|old woman|grandmother|oude vrouw|oma
👮+|police officer|cop|politieagent|politie
💂+|guard|guard|wachter|bewaker
👷+|construction worker|builder|bouwvakker|bouw
🤴+|prince|royal|prins|koninklijk
👸+|princess|royal|prinses|koninklijk
🎅+|santa claus|christmas|kerstman|kerst
🤶+|mrs claus|christmas|kerstvrouw|kerst
🧙+|mage|wizard magic|tovenaar|magie
🧚+|fairy|magic|fee|magie
🧛+|vampire|dracula|vampier|dracula
🧜+|merperson|mermaid|zeemeermin|zee
💃+|woman dancing|dance party|dansende vrouw|dansen feest
🕺+|man dancing|dance party|dansende man|dansen feest
🚶+|person walking|walk|wandelend persoon|lopen wandelen
🏃+|person running|run sport|rennend persoon|rennen hardlopen
🙋+|person raising hand|question|persoon die een hand opsteekt|vraag
🤷+|person shrugging|dunno|schouderophalend persoon|weet niet
🙅+|person gesturing no|no|persoon die nee gebaart|nee
🙆+|person gesturing ok|ok|persoon die ok gebaart|oké
💁+|person tipping hand|info|persoon met wijzende hand|info
🤦+|person facepalming|facepalm|persoon met hand voor het gezicht|facepalm
🙇+|person bowing|sorry respect|buigend persoon|sorry respect
👪|family|parents kids|gezin|ouders kinderen
💑|couple with heart|love|stel met hart|liefde
👫|woman and man holding hands|couple|vrouw en man hand in hand|stel
🗣|speaking head|talk|pratend hoofd|praten
👤|bust in silhouette|user profile|silhouet|gebruiker profiel
👥|busts in silhouette|users group|silhouetten|gebruikers groep`,
  ],
  [
    'animals',
    '🐶',
    `🐶|dog face|pet puppy|hondengezicht|huisdier puppy
🐱|cat face|pet kitten|kattengezicht|huisdier poes
🐭|mouse face|rodent|muisgezicht|knaagdier
🐹|hamster|pet|hamster|huisdier
🐰|rabbit face|bunny|konijnengezicht|haas
🦊|fox|animal|vos|dier
🐻|bear|animal|beer|dier
🐼|panda|bear|panda|beer
🐨|koala|animal|koala|dier
🐯|tiger face|cat|tijgergezicht|kat
🦁|lion|king cat|leeuw|koning kat
🐮|cow face|farm|koeiengezicht|boerderij
🐷|pig face|farm|varkensgezicht|boerderij
🐸|frog|animal|kikker|dier
🐵|monkey face|animal|apengezicht|aap
🐔|chicken|farm|kip|boerderij
🐧|penguin|bird|pinguïn|vogel
🐦|bird|tweet|vogel|tjilpen
🦅|eagle|bird|adelaar|vogel
🦆|duck|bird|eend|vogel
🦉|owl|night bird|uil|nacht vogel
🦇|bat|night|vleermuis|nacht
🐺|wolf|animal|wolf|dier
🐴|horse face|animal|paardengezicht|dier
🦄|unicorn|magic|eenhoorn|magie
🐝|honeybee|bee insect|honingbij|bij insect
🐛|bug|caterpillar insect|rups|insect
🦋|butterfly|insect|vlinder|insect
🐌|snail|slow|slak|langzaam
🐞|lady beetle|ladybug insect|lieveheersbeestje|insect
🐜|ant|insect|mier|insect
🕷|spider|insect|spin|insect
🐢|turtle|slow|schildpad|langzaam
🐍|snake|reptile|slang|reptiel
🦎|lizard|reptile|hagedis|reptiel
🐙|octopus|sea|octopus|zee
🦑|squid|sea|inktvis|zee
🦀|crab|sea|krab|zee
🐠|tropical fish|sea|tropische vis|zee
🐟|fish|sea|vis|zee
🐬|dolphin|sea|dolfijn|zee
🐳|spouting whale|sea|spuitende walvis|zee
🦈|shark|sea|haai|zee
🐊|crocodile|reptile|krokodil|reptiel
🐘|elephant|animal|olifant|dier
🦒|giraffe|animal|giraf|dier
🦓|zebra|animal|zebra|dier
🐪|camel|desert|kameel|woestijn
🐑|ewe|sheep|schaap|boerderij
🐐|goat|farm|geit|boerderij
🦌|deer|animal|hert|dier
🐕|dog|pet|hond|huisdier
🐈|cat|pet|kat|huisdier
🐇|rabbit|bunny|konijn|haas
🐿|chipmunk|squirrel|eekhoorn|dier
🦔|hedgehog|animal|egel|dier
🐾|paw prints|pets|pootafdrukken|huisdieren
🌵|cactus|desert plant|cactus|woestijn plant
🎄|christmas tree|holiday|kerstboom|kerst
🌲|evergreen tree|pine|naaldboom|den
🌳|deciduous tree|nature|loofboom|natuur
🌴|palm tree|beach tropical|palmboom|strand tropisch
🌱|seedling|plant grow|kiemplant|plant groeien
🌿|herb|plant|kruid|plant
🍀|four leaf clover|luck|klavertje vier|geluk
🍁|maple leaf|autumn|esdoornblad|herfst
🍂|fallen leaf|autumn|gevallen blad|herfst
🍄|mushroom|fungi|paddenstoel|champignon
🌷|tulip|flower|tulp|bloem
🌹|rose|flower love|roos|bloem liefde
🌻|sunflower|flower|zonnebloem|bloem
🌼|blossom|flower|bloesem|bloem
🌸|cherry blossom|flower spring|kersenbloesem|bloem lente
💐|bouquet|flowers|boeket|bloemen
🌍|globe showing europe-africa|earth world|aarde met europa en afrika|wereld
🌙|crescent moon|night|maansikkel|nacht
🌞|sun with face|sunny|zon met gezicht|zonnig
⭐|star|favorite|ster|favoriet
🌟|glowing star|shine|stralende ster|schitteren
✨|sparkles|shine magic new|schitteringen|glinsteren nieuw
⚡|high voltage|lightning power|bliksem|stroom
🔥|fire|hot lit|vuur|heet
💧|droplet|water|druppel|water
🌊|water wave|sea ocean|golf|zee oceaan
☀|sun|sunny weather|zon|zonnig weer
☁|cloud|weather|wolk|weer
🌧|cloud with rain|weather|wolk met regen|weer
⛈|cloud with lightning and rain|storm|onweer|storm
❄|snowflake|winter cold|sneeuwvlok|winter koud
☃|snowman|winter|sneeuwpop|winter
🌈|rainbow|pride|regenboog|pride`,
  ],
  [
    'food',
    '🍎',
    `🍎|red apple|fruit|rode appel|fruit
🍏|green apple|fruit|groene appel|fruit
🍐|pear|fruit|peer|fruit
🍊|tangerine|orange fruit|mandarijn|sinaasappel fruit
🍋|lemon|fruit sour|citroen|fruit zuur
🍌|banana|fruit|banaan|fruit
🍉|watermelon|fruit|watermeloen|fruit
🍇|grapes|fruit wine|druiven|fruit wijn
🍓|strawberry|fruit|aardbei|fruit
🍒|cherries|fruit|kersen|fruit
🍑|peach|fruit|perzik|fruit
🥭|mango|fruit|mango|fruit
🍍|pineapple|fruit|ananas|fruit
🥥|coconut|fruit|kokosnoot|fruit
🥝|kiwi fruit|fruit|kiwi|fruit
🍅|tomato|vegetable|tomaat|groente
🥑|avocado|fruit|avocado|fruit
🍆|eggplant|vegetable|aubergine|groente
🥔|potato|vegetable|aardappel|groente
🥕|carrot|vegetable|wortel|groente
🌽|ear of corn|maize|maiskolf|mais
🌶|hot pepper|spicy|peper|pittig
🥒|cucumber|vegetable|komkommer|groente
🥦|broccoli|vegetable|broccoli|groente
🧄|garlic|vegetable|knoflook|groente
🧅|onion|vegetable|ui|groente
🍞|bread|loaf|brood|bakker
🥐|croissant|bread breakfast|croissant|ontbijt
🥖|baguette bread|french|stokbrood|frans
🥨|pretzel|snack|pretzel|snack
🧀|cheese wedge|dairy|kaas|zuivel
🥚|egg|breakfast|ei|ontbijt
🍳|cooking|fried egg|bakken|gebakken ei
🥞|pancakes|breakfast|pannenkoeken|ontbijt
🧇|waffle|breakfast|wafel|ontbijt
🥓|bacon|breakfast|spek|ontbijt
🥩|cut of meat|steak|stuk vlees|biefstuk
🍗|poultry leg|chicken|kippenpoot|kip
🍖|meat on bone|food|vlees aan het bot|eten
🌭|hot dog|food|hotdog|eten
🍔|hamburger|burger fast food|hamburger|snelle hap
🍟|french fries|chips fast food|friet|patat snelle hap
🍕|pizza|food|pizza|eten
🥪|sandwich|lunch|sandwich|lunch
🌮|taco|mexican|taco|mexicaans
🌯|burrito|mexican|burrito|mexicaans
🥗|green salad|healthy|groene salade|gezond
🍝|spaghetti|pasta|spaghetti|pasta
🍜|steaming bowl|ramen noodles|dampende kom|noedels
🍲|pot of food|stew|pot met eten|stoofpot
🍛|curry rice|food|curry met rijst|eten
🍣|sushi|japanese fish|sushi|japans vis
🍱|bento box|japanese lunch|bentobox|japans lunch
🥟|dumpling|food|knoedel|eten
🍤|fried shrimp|prawn|gebakken garnaal|garnalen
🍙|rice ball|japanese|rijstbal|japans
🍚|cooked rice|food|gekookte rijst|eten
🍦|soft ice cream|dessert|softijs|dessert
🍨|ice cream|dessert|ijs|dessert
🍩|doughnut|donut sweet|donut|zoet
🍪|cookie|biscuit sweet|koekje|zoet
🎂|birthday cake|party|verjaardagstaart|feest
🍰|shortcake|cake dessert|taartpunt|gebak
🧁|cupcake|sweet|cupcake|zoet
🍫|chocolate bar|sweet|chocoladereep|zoet
🍬|candy|sweet|snoep|zoet
🍭|lollipop|candy|lolly|snoep
🍯|honey pot|sweet|honingpot|zoet
🥛|glass of milk|drink dairy|glas melk|drinken zuivel
☕|hot beverage|coffee tea|warme drank|koffie thee
🍵|teacup without handle|tea green|theekopje|thee
🥤|cup with straw|soda drink|beker met rietje|frisdrank drinken
🍺|beer mug|drink pub|bierpul|drinken kroeg
🍻|clinking beer mugs|cheers|klinkende bierpullen|proost
🥂|clinking glasses|cheers celebrate|klinkende glazen|proost vieren
🍷|wine glass|drink|wijnglas|drinken
🍸|cocktail glass|drink|cocktailglas|drinken
🍹|tropical drink|cocktail|tropische drank|cocktail
🍾|bottle with popping cork|champagne celebrate|fles met knallende kurk|champagne vieren
🥄|spoon|cutlery|lepel|bestek
🍴|fork and knife|cutlery eat|vork en mes|bestek eten
🍽|fork and knife with plate|dinner|bord met bestek|diner`,
  ],
  [
    'activities',
    '⚽',
    `⚽|soccer ball|football sport|voetbal|sport
🏀|basketball|sport|basketbal|sport
🏈|american football|sport|american football|sport
⚾|baseball|sport|honkbal|sport
🎾|tennis|sport|tennis|sport
🏐|volleyball|sport|volleybal|sport
🏉|rugby football|sport|rugby|sport
🎱|pool 8 ball|billiards|pool|biljart
🏓|ping pong|table tennis|pingpong|tafeltennis
🏸|badminton|sport|badminton|sport
🥊|boxing glove|sport|bokshandschoen|sport
🥋|martial arts uniform|judo karate|vechtsportpak|judo karate
⛳|flag in hole|golf|vlag in hole|golf
🎣|fishing pole|fish|hengel|vissen
🎿|skis|winter sport|ski's|wintersport
🚴|person biking|cycling|fietser|fietsen
🏊|person swimming|swim|zwemmer|zwemmen
🧘|person in lotus position|yoga meditate|persoon in lotushouding|yoga mediteren
🏆|trophy|win award|trofee|winnen prijs
🥇|1st place medal|gold winner|gouden medaille|goud winnaar
🥈|2nd place medal|silver|zilveren medaille|zilver
🥉|3rd place medal|bronze|bronzen medaille|brons
🏅|sports medal|award|sportmedaille|prijs
🎖|military medal|honor|militaire medaille|eer
🎫|ticket|admission|kaartje|toegang
🎟|admission tickets|event|toegangskaartjes|evenement
🎪|circus tent|show|circustent|show
🎭|performing arts|theater|toneel|theater
🎨|artist palette|art paint|schilderspalet|kunst verf
🎬|clapper board|movie film|filmklapper|film
🎤|microphone|sing karaoke|microfoon|zingen
🎧|headphone|music|koptelefoon|muziek
🎼|musical score|music|bladmuziek|muziek
🎹|musical keyboard|piano|keyboard|piano
🥁|drum|music|trommel|muziek
🎷|saxophone|music jazz|saxofoon|muziek jazz
🎸|guitar|music rock|gitaar|muziek rock
🎺|trumpet|music|trompet|muziek
🎻|violin|music|viool|muziek
🎲|game die|dice random|dobbelsteen|spel
🧩|puzzle piece|jigsaw|puzzelstuk|legpuzzel
🎯|direct hit|target bullseye goal|schot in de roos|doel
🎳|bowling|sport|bowlen|sport
🎮|video game|controller play|videospel|controller spelen
🎰|slot machine|casino|gokkast|casino
🎉|party popper|celebrate congratulations|feesttoeter|vieren gefeliciteerd
🎊|confetti ball|celebrate party|confettibal|vieren feest
🎈|balloon|party birthday|ballon|feest verjaardag
🎁|wrapped gift|present birthday|ingepakt cadeau|cadeautje verjaardag
🎀|ribbon|bow|lint|strik
🎃|jack-o-lantern|halloween pumpkin|pompoenlantaarn|halloween pompoen`,
  ],
  [
    'travel',
    '🚗',
    `🚗|automobile|car drive|auto|rijden
🚕|taxi|cab|taxi|cab
🚌|bus|transport|bus|vervoer
🚎|trolleybus|transport|trolleybus|vervoer
🚓|police car|cop|politieauto|politie
🚑|ambulance|emergency|ambulance|nood
🚒|fire engine|truck|brandweerwagen|brandweer
🚚|delivery truck|shipping|bestelwagen|bezorgen
🚜|tractor|farm|tractor|boerderij
🏎|racing car|fast|racewagen|snel
🛵|motor scooter|moped|scooter|bromfiets
🏍|motorcycle|bike|motorfiets|motor
🚲|bicycle|bike|fiets|fietsen
🛴|kick scooter|step|step|steppen
🚂|locomotive|train|locomotief|trein
🚆|train|rail|trein|spoor
🚇|metro|subway|metro|ondergrond
🚊|tram|transport|tram|vervoer
🚁|helicopter|fly|helikopter|vliegen
✈|airplane|flight travel|vliegtuig|vlucht reizen
🛫|airplane departure|takeoff|opstijgend vliegtuig|vertrek
🛬|airplane arrival|landing|landend vliegtuig|aankomst
🚀|rocket|launch space startup|raket|lancering ruimte
🛸|flying saucer|ufo|vliegende schotel|ufo
🛰|satellite|space|satelliet|ruimte
⛵|sailboat|boat sea|zeilboot|boot zee
🚤|speedboat|boat|speedboot|boot
🛳|passenger ship|cruise|passagiersschip|cruise
⚓|anchor|ship|anker|schip
⛽|fuel pump|gas petrol|benzinepomp|tanken
🚧|construction|roadwork|werkzaamheden|wegwerk
🚦|vertical traffic light|stoplight|verkeerslicht|stoplicht
🗺|world map|travel|wereldkaart|reizen
🗽|statue of liberty|new york|vrijheidsbeeld|new york
🗼|tokyo tower|japan|tokyo tower|japan
🏰|castle|palace|kasteel|paleis
🏯|japanese castle|japan|japans kasteel|japan
🎡|ferris wheel|amusement|reuzenrad|pretpark
🎢|roller coaster|amusement|achtbaan|pretpark
⛲|fountain|park|fontein|park
⛺|tent|camping|tent|kamperen
🏠|house|home|huis|thuis
🏡|house with garden|home|huis met tuin|thuis
🏢|office building|work|kantoorgebouw|werk
🏥|hospital|health|ziekenhuis|gezondheid
🏦|bank|money|bank|geld
🏨|hotel|stay|hotel|overnachten
🏪|convenience store|shop|buurtwinkel|winkel
🏫|school|education|school|onderwijs
🏭|factory|industry|fabriek|industrie
⛪|church|religion|kerk|religie
🕌|mosque|religion|moskee|religie
🏝|desert island|beach holiday|onbewoond eiland|strand vakantie
🏖|beach with umbrella|holiday|strand met parasol|vakantie
🏔|snow-capped mountain|mountain|besneeuwde berg|berg
⛰|mountain|hike|berg|wandelen
🌋|volcano|eruption|vulkaan|uitbarsting
🌅|sunrise|morning|zonsopgang|ochtend
🌆|cityscape at dusk|evening|stad bij schemering|avond
🌃|night with stars|city night|sterrennacht|nacht
🌉|bridge at night|bridge|brug bij nacht|brug
🧳|luggage|travel suitcase|bagage|reizen koffer
⏳|hourglass not done|time wait|zandloper met zand|tijd wachten
⌛|hourglass done|time|zandloper|tijd
⏰|alarm clock|time wake|wekker|tijd wakker
🕐|one o'clock|time|een uur|tijd
🕒|three o'clock|time|drie uur|tijd
🕕|six o'clock|time|zes uur|tijd
🕘|nine o'clock|time|negen uur|tijd
📍|round pushpin|location pin map|punaise|locatie kaart
🧭|compass|navigation|kompas|navigatie`,
  ],
  [
    'objects',
    '💡',
    `⌚|watch|time|horloge|tijd
📱|mobile phone|cell smartphone|mobiele telefoon|smartphone
📲|mobile phone with arrow|call|mobiele telefoon met pijl|bellen
☎|telephone|call|telefoon|bellen
📞|telephone receiver|call|hoorn|bellen
📠|fax machine|office|faxapparaat|kantoor
🔋|battery|power|batterij|stroom
🔌|electric plug|power|stekker|stroom
💻|laptop|computer work|laptop|computer werk
🖥|desktop computer|pc|desktopcomputer|pc
⌨|keyboard|type|toetsenbord|typen
🖱|computer mouse|click|computermuis|klikken
💾|floppy disk|save|diskette|opslaan
💿|optical disk|cd dvd|cd|dvd
📷|camera|photo|camera|foto
📸|camera with flash|photo|camera met flits|foto
📹|video camera|film|videocamera|film
🎥|movie camera|film|filmcamera|film
📺|television|tv|televisie|tv
📻|radio|music|radio|muziek
🔍|magnifying glass tilted left|search find|vergrootglas naar links|zoeken vinden
🔎|magnifying glass tilted right|search find|vergrootglas naar rechts|zoeken vinden
💡|light bulb|idea|gloeilamp|idee
🔦|flashlight|torch|zaklamp|licht
🕯|candle|light|kaars|licht
📖|open book|read|open boek|lezen
📚|books|library read|boeken|bibliotheek lezen
📓|notebook|notes|notitieboek|notities
📒|ledger|notes|kasboek|notities
📃|page with curl|document|pagina met omgekruld hoekje|document
📄|page facing up|document|pagina|document
📰|newspaper|news|krant|nieuws
📑|bookmark tabs|tabs|bladwijzers|tabbladen
🔖|bookmark|save|bladwijzer|opslaan
🏷|label|tag price|label|tag prijs
💰|money bag|cash rich|geldzak|geld rijk
💵|dollar banknote|money cash|dollarbiljet|geld
💶|euro banknote|money cash|eurobiljet|geld
💳|credit card|payment|creditcard|betalen
🧾|receipt|bill invoice|bonnetje|rekening factuur
💎|gem stone|diamond|edelsteen|diamant
✉|envelope|mail email|envelop|post mail
📧|e-mail|email mail|e-mail|mail
📨|incoming envelope|mail|inkomende envelop|post
📤|outbox tray|send|uitbak|versturen
📥|inbox tray|receive|inbak|ontvangen
📦|package|box delivery|pakket|doos bezorgen
📮|postbox|mail|brievenbus|post
✏|pencil|write edit|potlood|schrijven bewerken
✒|black nib|pen|vulpen|pen
🖊|pen|write|pen|schrijven
🖌|paintbrush|art|verfkwast|kunst
📝|memo|note write|memo|notitie schrijven
💼|briefcase|work business|aktetas|werk zaken
📁|file folder|directory|map|bestanden
📂|open file folder|directory|open map|bestanden
📅|calendar|date schedule|kalender|datum planning
📆|tear-off calendar|date|scheurkalender|datum
📊|bar chart|stats graph|staafdiagram|statistieken grafiek
📈|chart increasing|growth up|stijgende grafiek|groei omhoog
📉|chart decreasing|down|dalende grafiek|omlaag
📋|clipboard|list|klembord|lijst
📌|pushpin|pin|punaise|vastpinnen
📎|paperclip|attach|paperclip|bijlage
📏|straight ruler|measure|liniaal|meten
✂|scissors|cut|schaar|knippen
🗑|wastebasket|trash delete|prullenmand|verwijderen
🔒|locked|secure private|slot|veilig privé
🔓|unlocked|open|open slot|open
🔑|key|password access|sleutel|wachtwoord toegang
🔨|hammer|tool|hamer|gereedschap
🔧|wrench|tool fix|moersleutel|gereedschap repareren
⚙|gear|settings|tandwiel|instellingen
🔗|link|chain url|schakel|ketting url
🧰|toolbox|tools|gereedschapskist|gereedschap
🧲|magnet|attract|magneet|aantrekken
🧪|test tube|science lab|reageerbuis|wetenschap lab
🔬|microscope|science|microscoop|wetenschap
💊|pill|medicine|pil|medicijn
💉|syringe|vaccine|injectiespuit|vaccin
🔔|bell|notification|bel|melding
🔕|bell with slash|mute|bel met streep|stil
📢|loudspeaker|announce|luidspreker|aankondigen
📣|megaphone|announce|megafoon|aankondigen
💬|speech balloon|chat comment|spraakballon|chat reactie
💭|thought balloon|think|gedachtewolk|denken
🗯|right anger bubble|angry|boze spraakballon|boos
🛒|shopping cart|buy|winkelwagen|kopen
🧹|broom|clean|bezem|schoonmaken
🧺|basket|laundry|mand|was
🛏|bed|sleep|bed|slapen
🚪|door|exit enter|deur|uitgang ingang
🪑|chair|seat|stoel|zitplaats
🚿|shower|bath|douche|bad
🛁|bathtub|bath|bad|badkamer
🚽|toilet|bathroom|toilet|wc
🧻|roll of paper|toilet paper|rol papier|wc papier
🧯|fire extinguisher|safety|brandblusser|veiligheid`,
  ],
  [
    'symbols',
    '❤',
    `❤|red heart|love|rood hart|liefde
🧡|orange heart|love|oranje hart|liefde
💛|yellow heart|love|geel hart|liefde
💚|green heart|love|groen hart|liefde
💙|blue heart|love|blauw hart|liefde
💜|purple heart|love|paars hart|liefde
🖤|black heart|love|zwart hart|liefde
🤍|white heart|love|wit hart|liefde
💔|broken heart|sad|gebroken hart|verdriet
💕|two hearts|love|twee harten|liefde
💞|revolving hearts|love|draaiende harten|liefde
💓|beating heart|love|kloppend hart|liefde
💗|growing heart|love|groeiend hart|liefde
💖|sparkling heart|love|schitterend hart|liefde
💘|heart with arrow|love cupid|hart met pijl|liefde cupido
💝|heart with ribbon|gift love|hart met lint|cadeau liefde
💯|hundred points|perfect score|honderd punten|perfect score
💢|anger symbol|angry|boosheidssymbool|boos
💥|collision|boom bang|botsing|knal
💫|dizzy|star|duizeligheid|ster
💦|sweat droplets|water splash|zweetdruppels|water spetteren
💨|dashing away|fast wind|wegsnellen|snel wind
💤|zzz|sleep|zzz|slapen
✅|check mark button|done yes|vinkje|klaar ja
✔|check mark|done yes|vinkteken|klaar ja
☑|check box with check|done|aangevinkt vakje|klaar
❌|cross mark|no wrong|kruis|nee fout
✖|multiply|x|vermenigvuldigen|x
❎|cross mark button|no|kruisknop|nee
⭕|hollow red circle|circle|rode cirkel|cirkel
❗|red exclamation mark|important warning|uitroepteken|belangrijk waarschuwing
❓|red question mark|help question|vraagteken|hulp vraag
❕|white exclamation mark|note|wit uitroepteken|let op
❔|white question mark|question|wit vraagteken|vraag
‼|double exclamation mark|important|dubbel uitroepteken|belangrijk
⚠|warning|caution alert|waarschuwing|let op alarm
🚫|prohibited|no forbidden|verboden|nee niet toegestaan
⛔|no entry|stop forbidden|verboden toegang|stop
🔞|no one under eighteen|adult|geen toegang onder achttien|volwassen
♻|recycling symbol|green|recyclingsymbool|groen
➕|plus|add|plus|toevoegen
➖|minus|subtract|min|aftrekken
➗|divide|math|delen|rekenen
➡|right arrow|next|pijl naar rechts|volgende
⬅|left arrow|back|pijl naar links|terug
⬆|up arrow|up|pijl omhoog|omhoog
⬇|down arrow|down|pijl omlaag|omlaag
↗|up-right arrow|diagonal|pijl naar rechtsboven|diagonaal
🔄|counterclockwise arrows button|refresh reload|pijlen tegen de klok in|vernieuwen
🔃|clockwise vertical arrows|reload|verticale pijlen met de klok mee|herladen
🔙|back arrow|back|terugpijl|terug
🔝|top arrow|top|bovenpijl|boven
🆗|ok button|ok|ok knop|ok
🆕|new button|new|nieuw knop|nieuw
🆓|free button|free|gratis knop|gratis
🆘|sos button|help emergency|sos knop|hulp nood
ℹ|information|info|informatie|info
🔴|red circle|red|rode cirkel|rood
🟠|orange circle|orange|oranje cirkel|oranje
🟡|yellow circle|yellow|gele cirkel|geel
🟢|green circle|green|groene cirkel|groen
🔵|blue circle|blue|blauwe cirkel|blauw
🟣|purple circle|purple|paarse cirkel|paars
⚫|black circle|black|zwarte cirkel|zwart
⚪|white circle|white|witte cirkel|wit
🟥|red square|red|rood vierkant|rood
🟩|green square|green|groen vierkant|groen
🟦|blue square|blue|blauw vierkant|blauw
🔶|large orange diamond|orange|grote oranje ruit|oranje
🔷|large blue diamond|blue|grote blauwe ruit|blauw
▶|play button|start|afspeelknop|start
⏸|pause button|pause|pauzeknop|pauze
⏹|stop button|stop|stopknop|stop
⏩|fast-forward button|forward|vooruitspoelen|vooruit
©|copyright|legal|copyright|juridisch
®|registered|trademark|geregistreerd|merk
™|trade mark|trademark|handelsmerk|merk
#️⃣|keycap number sign|hash|toets hekje|hasj
🏁|chequered flag|finish race|geblokte vlag|finish race
🚩|triangular flag|flag|driehoekige vlag|vlag
🏳|white flag|surrender|witte vlag|overgave
🏴|black flag|flag|zwarte vlag|vlag
🏳️‍🌈|rainbow flag|pride|regenboogvlag|pride
🇳🇱|flag netherlands|dutch|vlag nederland|nederlands
🇧🇪|flag belgium|belgian|vlag belgië|belgisch
🇩🇪|flag germany|german|vlag duitsland|duits
🇫🇷|flag france|french|vlag frankrijk|frans
🇪🇸|flag spain|spanish|vlag spanje|spaans
🇬🇧|flag united kingdom|british uk|vlag verenigd koninkrijk|brits
🇺🇸|flag united states|american usa|vlag verenigde staten|amerikaans
🇪🇺|flag european union|europe|vlag europese unie|europa`,
  ],
];

export interface EmojiItem {
  /** The character, without skin tone. */
  char: string;
  name: { en: string; nl: string };
  /** The words that find it, in both languages, lower case and without accents. */
  words: string;
  /** It has skin tones. */
  tones: boolean;
}

export interface EmojiGroup {
  id: string;
  /** The emoji that stands for the group. */
  icon: string;
  items: EmojiItem[];
}

/** What is looked for is written in lower case and without accents, so `Peer` and `péér` find the same. */
export const plain = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const EMOJI_GROUPS: EmojiGroup[] = DATA.map(([id, icon, lines]) => ({
  id,
  icon,
  items: lines.split('\n').map((line) => {
    const [char, en, enWords, nl, nlWords] = line.split('|');
    const tones = char.endsWith('+');
    return {
      char: tones ? char.slice(0, -1) : char,
      name: { en, nl },
      words: plain(`${en} ${enWords} ${nl} ${nlWords}`),
      tones,
    };
  }),
}));

/** The skin tones, in the order of the picker: none, then light to dark (the Fitzpatrick modifiers). */
export const SKIN_TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];

/** The emoji with a skin tone (0 is none, 1 to 5 light to dark); an emoji that has none stays as it is. */
export function withTone(item: EmojiItem, tone: number): string {
  if (!item.tones || tone < 1 || tone > 5) return item.char;
  return item.char.replace(/️/g, '') + SKIN_TONES[tone];
}

/** The name of an emoji in a language that has names (Dutch), or English. */
export const emojiName = (item: EmojiItem, language: string): string => (language === 'nl' ? item.name.nl : item.name.en);

const ALL: EmojiItem[] = EMOJI_GROUPS.flatMap((g) => g.items);

/**
 * The emoji that match what was typed: every word of it has to start a word of the name or of the words of the emoji (in English or in
 * Dutch), the ones whose name starts with it first. `limit` is the most that are given back.
 */
export function searchEmoji(query: string, limit = 60): EmojiItem[] {
  const terms = plain(query).split(/[\s_:-]+/).filter(Boolean);
  if (!terms.length) return [];
  const found: Array<[score: number, item: EmojiItem]> = [];
  for (const item of ALL) {
    const words = ` ${item.words}`;
    if (!terms.every((t) => words.includes(` ${t}`))) continue;
    const first = plain(item.name.en).startsWith(terms[0]) || plain(item.name.nl).startsWith(terms[0]);
    found.push([first ? 0 : 1, item]);
  }
  return found.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, item]) => item);
}
