// Official lists for the Choir Music & Instrument Library (design revision 4, pages 4–5).
// Every list except type, difficulty and file kind also accepts entries people type themselves
// ("+ Other"); those are saved as suggestions (models/Library.js, LibraryTerm) and never replace these.
const KEYS = [];
for (const n of ['C', 'C♯ / D♭', 'D', 'E♭', 'E', 'F', 'F♯ / G♭', 'G', 'A♭', 'A', 'B♭', 'B']) KEYS.push(`${n} major`);
for (const n of ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B']) KEYS.push(`${n} minor`);
KEYS.push('Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian');
for (const m of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']) KEYS.push(`Chant mode ${m}`);

const LISTS = {
  massParts: ['Entrance / Processional', 'Introit (chant)', 'Sprinkling rite (Asperges me / Vidi aquam)', 'Penitential Act', 'Kyrie', 'Gloria',
    'Responsorial Psalm', 'Gradual', 'Sequence', 'Gospel Acclamation / Alleluia', 'Lenten Gospel Acclamation', 'Profession of Faith (Credo)',
    'Prayer of the Faithful response', 'Offertory / Presentation of the Gifts', 'Holy (Sanctus)', 'Memorial Acclamation', 'Great Amen',
    "Lord's Prayer", 'Doxology', 'Sign of Peace', 'Lamb of God (Agnus Dei)', 'Communion', 'Thanksgiving / Post-Communion',
    'Recessional / Closing', 'Marian antiphon'],
  seasons: ['Advent', 'Christmas', 'Ordinary Time', 'Lent', 'Holy Week', 'Easter Triduum', 'Easter', 'Any season',
    'Mary, Mother of God (1 Jan)', 'Epiphany', 'Baptism of the Lord', 'Presentation of the Lord', 'Ash Wednesday', 'St Joseph', 'Annunciation',
    'Palm Sunday', 'Holy Thursday', 'Good Friday', 'Easter Vigil', 'Divine Mercy Sunday', 'Ascension', 'Pentecost', 'Holy Trinity',
    'Corpus Christi', 'Sacred Heart', 'St Barnabas (11 June)', 'Sts Peter and Paul', 'Transfiguration', 'Assumption',
    'Exaltation of the Holy Cross', 'Our Lady of the Rosary', 'All Saints', 'All Souls', 'Christ the King', 'Immaculate Conception', 'Holy Family'],
  occasions: ['Sunday Mass', 'Saturday vigil Mass', 'Weekday Mass', "Children's / Family Mass", 'Youth Mass', 'Choir Mass / choir anniversary',
    'Parish feast', 'Wedding', 'Funeral / Requiem', 'Wake / vigil for the dead', 'Baptism', 'First Holy Communion', 'Confirmation', 'Ordination',
    'Religious profession', "Priest's jubilee", 'Anointing of the Sick / healing Mass', 'Eucharistic Adoration', 'Benediction', 'Rosary',
    'Stations of the Cross', 'Novena', 'Reconciliation service', 'Retreat', 'Pilgrimage', 'Procession', 'Harvest / thanksgiving',
    'Carol service', 'Concert', 'Graduation', 'Ecumenical service', "Bishop's visit", 'Blessing of a home or church', 'National or civic event'],
  themes: ['Praise', 'Thanksgiving', 'Faith and Trust', 'Hope and Encouragement', 'Love and Charity', 'Salvation and Redemption',
    'Forgiveness and Mercy', 'Discipleship', 'Christian Unity', 'Spiritual Warfare', 'Prayer and Consecration', 'Heaven and Eternal Life',
    "God's Guidance and Protection", 'Holy Spirit', 'Sacred Heart', 'Eucharist', 'Mary', 'The Cross and Passion', 'Resurrection',
    'Missionary / Evangelical', 'Vocations', 'Creation', 'Peace and Justice', 'The Good Shepherd', 'Joy', 'Healing', 'Family',
    'Repentance', 'Light of the World'],
  genre: ['Traditional hymn', 'Gregorian chant', 'Vernacular chant', 'Polyphony (Renaissance)', 'Classical / motet', 'Mass setting',
    'Responsorial psalm', 'Canticle', 'Antiphon', 'Litany', 'Anthem', 'Carol', 'Spiritual', 'Gospel', 'Afro-gospel', 'African choral',
    'Congolese rumba / choral', 'Highlife', 'Contemporary worship', 'Praise and worship', 'Taizé', 'Folk / acoustic', 'Latin hymn',
    'Marian hymn', 'Organ voluntary', 'Instrumental piece', 'Interlude / meditation'],
  languages: ['English', 'Latin', 'French', 'Swahili', 'Lingala', 'Kikongo', 'Tshiluba', 'Kinyarwanda', 'Kirundi', 'Igbo', 'Yoruba', 'Hausa',
    'Efik / Ibibio', 'Nigerian Pidgin', 'Twi', 'Zulu', 'Turkish', 'Italian', 'Spanish', 'Portuguese', 'German', 'Arabic', 'Greek', 'Aramaic',
    'Mixed languages'],
  voicing: ['SATB', 'SATB with divisi', 'SSAATTBB', 'SAB', 'SSA', 'SA', 'TTBB', 'TB', 'Two-part', 'Three-part', 'Unison', 'Unison with descant',
    'Solo', 'Solo and choir', 'Cantor and people', 'Call and response', 'Double choir'],
  instruments: ['Organ', 'Pipe organ', 'Piano', 'Keyboard / synth', 'Acoustic guitar', 'Electric guitar', 'Bass guitar', 'Violin', 'Viola', 'Cello',
    'Double bass', 'Flute', 'Recorder', 'Clarinet', 'Saxophone', 'Trumpet', 'Trombone', 'French horn', 'Drum kit', 'Congas', 'Djembe',
    'Talking drum', 'Ngoma / tam-tam', 'Shekere', 'Maracas', 'Tambourine', 'Bells / handbells', 'Harp', 'Xylophone / marimba',
    'Likembe / mbira', 'A cappella (no instruments)'],
  keys: KEYS,
  tempo: ['Grave', 'Largo', 'Larghetto', 'Lento', 'Adagio', 'Andante', 'Andantino', 'Moderato', 'Allegretto', 'Allegro', 'Vivace', 'Presto',
    'Rubato / free', 'Free chant rhythm'],
  tempoChanges: ['Accelerando', 'Ritardando', 'Rallentando', 'Allargando', 'Stringendo', 'Più mosso', 'Meno mosso', 'A tempo', 'Tempo primo',
    'Fermata', 'Pause / breath mark'],
  character: ['Maestoso', 'Solenne', 'Dolce', 'Cantabile', 'Espressivo', 'Legato', 'Giocoso', 'Con spirito', 'Tranquillo', 'Marcato'],
  copyright: ['Public domain', 'Licence held', 'Permission from composer', 'Unknown'],
  difficulty: ['Easy', 'Intermediate', 'Advanced', 'Very advanced'],
  fileKinds: ['Full score', 'Part score', 'Lyrics sheet', 'Chord chart / lead sheet', 'Accompaniment score', 'Instrumental part',
    'Practice audio', 'Full recording', 'Performance video', 'MIDI', 'Notation file', 'Recording link'],
  parts: ['Full', 'Soprano', 'Alto', 'Tenor', 'Bass', 'Soprano 1', 'Soprano 2', 'Tenor 1', 'Tenor 2', 'Baritone', 'Descant', 'Solo', 'Cantor',
    'Organ', 'Piano', 'Keyboard', 'Guitar', 'Bass guitar', 'Violin', 'Flute', 'Trumpet', 'Drums', 'Other instrument'],
};

// Lists that accept custom entries; type, difficulty and file kind are fixed
const OPEN = new Set(['massParts', 'seasons', 'occasions', 'themes', 'genre', 'languages', 'voicing', 'instruments', 'keys', 'tempo',
  'tempoChanges', 'character', 'copyright', 'parts']);

// File kinds that count as "a score" for sending to approval
const SCORE_KINDS = ['Full score', 'Part score', 'Lyrics sheet', 'Chord chart / lead sheet', 'Accompaniment score', 'Instrumental part', 'Notation file'];

module.exports = { LISTS, OPEN, SCORE_KINDS };
