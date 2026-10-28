-- ============================================================================
-- PokéGear 11 — XP rework, full Pokédex, Team/PC integrity, virtual TCG cards
-- ============================================================================
-- Run after 0001–0010. Safe on a live database with existing players:
--   * nothing is deleted;
--   * the one-time XP conversion is guarded so re-running this file never
--     converts twice;
--   * Pokémon in an invalid storage spot are MOVED to a free slot, never
--     removed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Full National Pokédex (1–1025): English names + types from PokéAPI.
--    Existing species keep their current name; types are only filled where
--    missing, so nothing a Game Master already set is overwritten.
-- ---------------------------------------------------------------------------
insert into public.species (id, name, type1, type2) values
(1,'Bulbasaur','grass','poison'),
(2,'Ivysaur','grass','poison'),
(3,'Venusaur','grass','poison'),
(4,'Charmander','fire',null),
(5,'Charmeleon','fire',null),
(6,'Charizard','fire','flying'),
(7,'Squirtle','water',null),
(8,'Wartortle','water',null),
(9,'Blastoise','water',null),
(10,'Caterpie','bug',null),
(11,'Metapod','bug',null),
(12,'Butterfree','bug','flying'),
(13,'Weedle','bug','poison'),
(14,'Kakuna','bug','poison'),
(15,'Beedrill','bug','poison'),
(16,'Pidgey','normal','flying'),
(17,'Pidgeotto','normal','flying'),
(18,'Pidgeot','normal','flying'),
(19,'Rattata','normal',null),
(20,'Raticate','normal',null),
(21,'Spearow','normal','flying'),
(22,'Fearow','normal','flying'),
(23,'Ekans','poison',null),
(24,'Arbok','poison',null),
(25,'Pikachu','electric',null),
(26,'Raichu','electric',null),
(27,'Sandshrew','ground',null),
(28,'Sandslash','ground',null),
(29,'Nidoran♀','poison',null),
(30,'Nidorina','poison',null),
(31,'Nidoqueen','poison','ground'),
(32,'Nidoran♂','poison',null),
(33,'Nidorino','poison',null),
(34,'Nidoking','poison','ground'),
(35,'Clefairy','fairy',null),
(36,'Clefable','fairy',null),
(37,'Vulpix','fire',null),
(38,'Ninetales','fire',null),
(39,'Jigglypuff','normal','fairy'),
(40,'Wigglytuff','normal','fairy'),
(41,'Zubat','poison','flying'),
(42,'Golbat','poison','flying'),
(43,'Oddish','grass','poison'),
(44,'Gloom','grass','poison'),
(45,'Vileplume','grass','poison'),
(46,'Paras','bug','grass'),
(47,'Parasect','bug','grass'),
(48,'Venonat','bug','poison'),
(49,'Venomoth','bug','poison'),
(50,'Diglett','ground',null),
(51,'Dugtrio','ground',null),
(52,'Meowth','normal',null),
(53,'Persian','normal',null),
(54,'Psyduck','water',null),
(55,'Golduck','water',null),
(56,'Mankey','fighting',null),
(57,'Primeape','fighting',null),
(58,'Growlithe','fire',null),
(59,'Arcanine','fire',null),
(60,'Poliwag','water',null),
(61,'Poliwhirl','water',null),
(62,'Poliwrath','water','fighting'),
(63,'Abra','psychic',null),
(64,'Kadabra','psychic',null),
(65,'Alakazam','psychic',null),
(66,'Machop','fighting',null),
(67,'Machoke','fighting',null),
(68,'Machamp','fighting',null),
(69,'Bellsprout','grass','poison'),
(70,'Weepinbell','grass','poison'),
(71,'Victreebel','grass','poison'),
(72,'Tentacool','water','poison'),
(73,'Tentacruel','water','poison'),
(74,'Geodude','rock','ground'),
(75,'Graveler','rock','ground'),
(76,'Golem','rock','ground'),
(77,'Ponyta','fire',null),
(78,'Rapidash','fire',null),
(79,'Slowpoke','water','psychic'),
(80,'Slowbro','water','psychic'),
(81,'Magnemite','electric','steel'),
(82,'Magneton','electric','steel'),
(83,'Farfetch’d','normal','flying'),
(84,'Doduo','normal','flying'),
(85,'Dodrio','normal','flying'),
(86,'Seel','water',null),
(87,'Dewgong','water','ice'),
(88,'Grimer','poison',null),
(89,'Muk','poison',null),
(90,'Shellder','water',null),
(91,'Cloyster','water','ice'),
(92,'Gastly','ghost','poison'),
(93,'Haunter','ghost','poison'),
(94,'Gengar','ghost','poison'),
(95,'Onix','rock','ground'),
(96,'Drowzee','psychic',null),
(97,'Hypno','psychic',null),
(98,'Krabby','water',null),
(99,'Kingler','water',null),
(100,'Voltorb','electric',null),
(101,'Electrode','electric',null),
(102,'Exeggcute','grass','psychic'),
(103,'Exeggutor','grass','psychic'),
(104,'Cubone','ground',null),
(105,'Marowak','ground',null),
(106,'Hitmonlee','fighting',null),
(107,'Hitmonchan','fighting',null),
(108,'Lickitung','normal',null),
(109,'Koffing','poison',null),
(110,'Weezing','poison',null),
(111,'Rhyhorn','ground','rock'),
(112,'Rhydon','ground','rock'),
(113,'Chansey','normal',null),
(114,'Tangela','grass',null),
(115,'Kangaskhan','normal',null),
(116,'Horsea','water',null),
(117,'Seadra','water',null),
(118,'Goldeen','water',null),
(119,'Seaking','water',null),
(120,'Staryu','water',null),
(121,'Starmie','water','psychic'),
(122,'Mr. Mime','psychic','fairy'),
(123,'Scyther','bug','flying'),
(124,'Jynx','ice','psychic'),
(125,'Electabuzz','electric',null),
(126,'Magmar','fire',null),
(127,'Pinsir','bug',null),
(128,'Tauros','normal',null),
(129,'Magikarp','water',null),
(130,'Gyarados','water','flying'),
(131,'Lapras','water','ice'),
(132,'Ditto','normal',null),
(133,'Eevee','normal',null),
(134,'Vaporeon','water',null),
(135,'Jolteon','electric',null),
(136,'Flareon','fire',null),
(137,'Porygon','normal',null),
(138,'Omanyte','rock','water'),
(139,'Omastar','rock','water'),
(140,'Kabuto','rock','water'),
(141,'Kabutops','rock','water'),
(142,'Aerodactyl','rock','flying'),
(143,'Snorlax','normal',null),
(144,'Articuno','ice','flying'),
(145,'Zapdos','electric','flying'),
(146,'Moltres','fire','flying'),
(147,'Dratini','dragon',null),
(148,'Dragonair','dragon',null),
(149,'Dragonite','dragon','flying'),
(150,'Mewtwo','psychic',null),
(151,'Mew','psychic',null),
(152,'Chikorita','grass',null),
(153,'Bayleef','grass',null),
(154,'Meganium','grass',null),
(155,'Cyndaquil','fire',null),
(156,'Quilava','fire',null),
(157,'Typhlosion','fire',null),
(158,'Totodile','water',null),
(159,'Croconaw','water',null),
(160,'Feraligatr','water',null),
(161,'Sentret','normal',null),
(162,'Furret','normal',null),
(163,'Hoothoot','normal','flying'),
(164,'Noctowl','normal','flying'),
(165,'Ledyba','bug','flying'),
(166,'Ledian','bug','flying'),
(167,'Spinarak','bug','poison'),
(168,'Ariados','bug','poison'),
(169,'Crobat','poison','flying'),
(170,'Chinchou','water','electric'),
(171,'Lanturn','water','electric'),
(172,'Pichu','electric',null),
(173,'Cleffa','fairy',null),
(174,'Igglybuff','normal','fairy'),
(175,'Togepi','fairy',null),
(176,'Togetic','fairy','flying'),
(177,'Natu','psychic','flying'),
(178,'Xatu','psychic','flying'),
(179,'Mareep','electric',null),
(180,'Flaaffy','electric',null),
(181,'Ampharos','electric',null),
(182,'Bellossom','grass',null),
(183,'Marill','water','fairy'),
(184,'Azumarill','water','fairy'),
(185,'Sudowoodo','rock',null),
(186,'Politoed','water',null),
(187,'Hoppip','grass','flying'),
(188,'Skiploom','grass','flying'),
(189,'Jumpluff','grass','flying'),
(190,'Aipom','normal',null),
(191,'Sunkern','grass',null),
(192,'Sunflora','grass',null),
(193,'Yanma','bug','flying'),
(194,'Wooper','water','ground'),
(195,'Quagsire','water','ground'),
(196,'Espeon','psychic',null),
(197,'Umbreon','dark',null),
(198,'Murkrow','dark','flying'),
(199,'Slowking','water','psychic'),
(200,'Misdreavus','ghost',null),
(201,'Unown','psychic',null),
(202,'Wobbuffet','psychic',null),
(203,'Girafarig','normal','psychic'),
(204,'Pineco','bug',null),
(205,'Forretress','bug','steel'),
(206,'Dunsparce','normal',null),
(207,'Gligar','ground','flying'),
(208,'Steelix','steel','ground'),
(209,'Snubbull','fairy',null),
(210,'Granbull','fairy',null),
(211,'Qwilfish','water','poison'),
(212,'Scizor','bug','steel'),
(213,'Shuckle','bug','rock'),
(214,'Heracross','bug','fighting'),
(215,'Sneasel','dark','ice'),
(216,'Teddiursa','normal',null),
(217,'Ursaring','normal',null),
(218,'Slugma','fire',null),
(219,'Magcargo','fire','rock'),
(220,'Swinub','ice','ground'),
(221,'Piloswine','ice','ground'),
(222,'Corsola','water','rock'),
(223,'Remoraid','water',null),
(224,'Octillery','water',null),
(225,'Delibird','ice','flying'),
(226,'Mantine','water','flying'),
(227,'Skarmory','steel','flying'),
(228,'Houndour','dark','fire'),
(229,'Houndoom','dark','fire'),
(230,'Kingdra','water','dragon'),
(231,'Phanpy','ground',null),
(232,'Donphan','ground',null),
(233,'Porygon2','normal',null),
(234,'Stantler','normal',null),
(235,'Smeargle','normal',null),
(236,'Tyrogue','fighting',null),
(237,'Hitmontop','fighting',null),
(238,'Smoochum','ice','psychic'),
(239,'Elekid','electric',null),
(240,'Magby','fire',null),
(241,'Miltank','normal',null),
(242,'Blissey','normal',null),
(243,'Raikou','electric',null),
(244,'Entei','fire',null),
(245,'Suicune','water',null),
(246,'Larvitar','rock','ground'),
(247,'Pupitar','rock','ground'),
(248,'Tyranitar','rock','dark'),
(249,'Lugia','psychic','flying'),
(250,'Ho-Oh','fire','flying'),
(251,'Celebi','psychic','grass'),
(252,'Treecko','grass',null),
(253,'Grovyle','grass',null),
(254,'Sceptile','grass',null),
(255,'Torchic','fire',null),
(256,'Combusken','fire','fighting'),
(257,'Blaziken','fire','fighting'),
(258,'Mudkip','water',null),
(259,'Marshtomp','water','ground'),
(260,'Swampert','water','ground'),
(261,'Poochyena','dark',null),
(262,'Mightyena','dark',null),
(263,'Zigzagoon','normal',null),
(264,'Linoone','normal',null),
(265,'Wurmple','bug',null),
(266,'Silcoon','bug',null),
(267,'Beautifly','bug','flying'),
(268,'Cascoon','bug',null),
(269,'Dustox','bug','poison'),
(270,'Lotad','water','grass'),
(271,'Lombre','water','grass'),
(272,'Ludicolo','water','grass'),
(273,'Seedot','grass',null),
(274,'Nuzleaf','grass','dark'),
(275,'Shiftry','grass','dark'),
(276,'Taillow','normal','flying'),
(277,'Swellow','normal','flying'),
(278,'Wingull','water','flying'),
(279,'Pelipper','water','flying'),
(280,'Ralts','psychic','fairy'),
(281,'Kirlia','psychic','fairy'),
(282,'Gardevoir','psychic','fairy'),
(283,'Surskit','bug','water'),
(284,'Masquerain','bug','flying'),
(285,'Shroomish','grass',null),
(286,'Breloom','grass','fighting'),
(287,'Slakoth','normal',null),
(288,'Vigoroth','normal',null),
(289,'Slaking','normal',null),
(290,'Nincada','bug','ground'),
(291,'Ninjask','bug','flying'),
(292,'Shedinja','bug','ghost'),
(293,'Whismur','normal',null),
(294,'Loudred','normal',null),
(295,'Exploud','normal',null),
(296,'Makuhita','fighting',null),
(297,'Hariyama','fighting',null),
(298,'Azurill','normal','fairy'),
(299,'Nosepass','rock',null),
(300,'Skitty','normal',null),
(301,'Delcatty','normal',null),
(302,'Sableye','dark','ghost'),
(303,'Mawile','steel','fairy'),
(304,'Aron','steel','rock'),
(305,'Lairon','steel','rock'),
(306,'Aggron','steel','rock'),
(307,'Meditite','fighting','psychic'),
(308,'Medicham','fighting','psychic'),
(309,'Electrike','electric',null),
(310,'Manectric','electric',null),
(311,'Plusle','electric',null),
(312,'Minun','electric',null),
(313,'Volbeat','bug',null),
(314,'Illumise','bug',null),
(315,'Roselia','grass','poison'),
(316,'Gulpin','poison',null),
(317,'Swalot','poison',null),
(318,'Carvanha','water','dark'),
(319,'Sharpedo','water','dark'),
(320,'Wailmer','water',null),
(321,'Wailord','water',null),
(322,'Numel','fire','ground'),
(323,'Camerupt','fire','ground'),
(324,'Torkoal','fire',null),
(325,'Spoink','psychic',null),
(326,'Grumpig','psychic',null),
(327,'Spinda','normal',null),
(328,'Trapinch','ground',null),
(329,'Vibrava','ground','dragon'),
(330,'Flygon','ground','dragon'),
(331,'Cacnea','grass',null),
(332,'Cacturne','grass','dark'),
(333,'Swablu','normal','flying'),
(334,'Altaria','dragon','flying'),
(335,'Zangoose','normal',null),
(336,'Seviper','poison',null),
(337,'Lunatone','rock','psychic'),
(338,'Solrock','rock','psychic'),
(339,'Barboach','water','ground'),
(340,'Whiscash','water','ground'),
(341,'Corphish','water',null),
(342,'Crawdaunt','water','dark'),
(343,'Baltoy','ground','psychic'),
(344,'Claydol','ground','psychic'),
(345,'Lileep','rock','grass'),
(346,'Cradily','rock','grass'),
(347,'Anorith','rock','bug'),
(348,'Armaldo','rock','bug'),
(349,'Feebas','water',null),
(350,'Milotic','water',null),
(351,'Castform','normal',null),
(352,'Kecleon','normal',null),
(353,'Shuppet','ghost',null),
(354,'Banette','ghost',null),
(355,'Duskull','ghost',null),
(356,'Dusclops','ghost',null),
(357,'Tropius','grass','flying'),
(358,'Chimecho','psychic',null),
(359,'Absol','dark',null),
(360,'Wynaut','psychic',null),
(361,'Snorunt','ice',null),
(362,'Glalie','ice',null),
(363,'Spheal','ice','water'),
(364,'Sealeo','ice','water'),
(365,'Walrein','ice','water'),
(366,'Clamperl','water',null),
(367,'Huntail','water',null),
(368,'Gorebyss','water',null),
(369,'Relicanth','water','rock'),
(370,'Luvdisc','water',null),
(371,'Bagon','dragon',null),
(372,'Shelgon','dragon',null),
(373,'Salamence','dragon','flying'),
(374,'Beldum','steel','psychic'),
(375,'Metang','steel','psychic'),
(376,'Metagross','steel','psychic'),
(377,'Regirock','rock',null),
(378,'Regice','ice',null),
(379,'Registeel','steel',null),
(380,'Latias','dragon','psychic'),
(381,'Latios','dragon','psychic'),
(382,'Kyogre','water',null),
(383,'Groudon','ground',null),
(384,'Rayquaza','dragon','flying'),
(385,'Jirachi','steel','psychic'),
(386,'Deoxys','psychic',null),
(387,'Turtwig','grass',null),
(388,'Grotle','grass',null),
(389,'Torterra','grass','ground'),
(390,'Chimchar','fire',null),
(391,'Monferno','fire','fighting'),
(392,'Infernape','fire','fighting'),
(393,'Piplup','water',null),
(394,'Prinplup','water',null),
(395,'Empoleon','water','steel'),
(396,'Starly','normal','flying'),
(397,'Staravia','normal','flying'),
(398,'Staraptor','normal','flying'),
(399,'Bidoof','normal',null),
(400,'Bibarel','normal','water'),
(401,'Kricketot','bug',null),
(402,'Kricketune','bug',null),
(403,'Shinx','electric',null),
(404,'Luxio','electric',null),
(405,'Luxray','electric',null),
(406,'Budew','grass','poison'),
(407,'Roserade','grass','poison'),
(408,'Cranidos','rock',null),
(409,'Rampardos','rock',null),
(410,'Shieldon','rock','steel'),
(411,'Bastiodon','rock','steel'),
(412,'Burmy','bug',null),
(413,'Wormadam','bug','grass'),
(414,'Mothim','bug','flying'),
(415,'Combee','bug','flying'),
(416,'Vespiquen','bug','flying'),
(417,'Pachirisu','electric',null),
(418,'Buizel','water',null),
(419,'Floatzel','water',null),
(420,'Cherubi','grass',null),
(421,'Cherrim','grass',null),
(422,'Shellos','water',null),
(423,'Gastrodon','water','ground'),
(424,'Ambipom','normal',null),
(425,'Drifloon','ghost','flying'),
(426,'Drifblim','ghost','flying'),
(427,'Buneary','normal',null),
(428,'Lopunny','normal',null),
(429,'Mismagius','ghost',null),
(430,'Honchkrow','dark','flying'),
(431,'Glameow','normal',null),
(432,'Purugly','normal',null),
(433,'Chingling','psychic',null),
(434,'Stunky','poison','dark'),
(435,'Skuntank','poison','dark'),
(436,'Bronzor','steel','psychic'),
(437,'Bronzong','steel','psychic'),
(438,'Bonsly','rock',null),
(439,'Mime Jr.','psychic','fairy'),
(440,'Happiny','normal',null),
(441,'Chatot','normal','flying'),
(442,'Spiritomb','ghost','dark'),
(443,'Gible','dragon','ground'),
(444,'Gabite','dragon','ground'),
(445,'Garchomp','dragon','ground'),
(446,'Munchlax','normal',null),
(447,'Riolu','fighting',null),
(448,'Lucario','fighting','steel'),
(449,'Hippopotas','ground',null),
(450,'Hippowdon','ground',null),
(451,'Skorupi','poison','bug'),
(452,'Drapion','poison','dark'),
(453,'Croagunk','poison','fighting'),
(454,'Toxicroak','poison','fighting'),
(455,'Carnivine','grass',null),
(456,'Finneon','water',null),
(457,'Lumineon','water',null),
(458,'Mantyke','water','flying'),
(459,'Snover','grass','ice'),
(460,'Abomasnow','grass','ice'),
(461,'Weavile','dark','ice'),
(462,'Magnezone','electric','steel'),
(463,'Lickilicky','normal',null),
(464,'Rhyperior','ground','rock'),
(465,'Tangrowth','grass',null),
(466,'Electivire','electric',null),
(467,'Magmortar','fire',null),
(468,'Togekiss','fairy','flying'),
(469,'Yanmega','bug','flying'),
(470,'Leafeon','grass',null),
(471,'Glaceon','ice',null),
(472,'Gliscor','ground','flying'),
(473,'Mamoswine','ice','ground'),
(474,'Porygon-Z','normal',null),
(475,'Gallade','psychic','fighting'),
(476,'Probopass','rock','steel'),
(477,'Dusknoir','ghost',null),
(478,'Froslass','ice','ghost'),
(479,'Rotom','electric','ghost'),
(480,'Uxie','psychic',null),
(481,'Mesprit','psychic',null),
(482,'Azelf','psychic',null),
(483,'Dialga','steel','dragon'),
(484,'Palkia','water','dragon'),
(485,'Heatran','fire','steel'),
(486,'Regigigas','normal',null),
(487,'Giratina','ghost','dragon'),
(488,'Cresselia','psychic',null),
(489,'Phione','water',null),
(490,'Manaphy','water',null),
(491,'Darkrai','dark',null),
(492,'Shaymin','grass',null),
(493,'Arceus','normal',null),
(494,'Victini','psychic','fire'),
(495,'Snivy','grass',null),
(496,'Servine','grass',null),
(497,'Serperior','grass',null),
(498,'Tepig','fire',null),
(499,'Pignite','fire','fighting'),
(500,'Emboar','fire','fighting'),
(501,'Oshawott','water',null),
(502,'Dewott','water',null),
(503,'Samurott','water',null),
(504,'Patrat','normal',null),
(505,'Watchog','normal',null),
(506,'Lillipup','normal',null),
(507,'Herdier','normal',null),
(508,'Stoutland','normal',null),
(509,'Purrloin','dark',null),
(510,'Liepard','dark',null),
(511,'Pansage','grass',null),
(512,'Simisage','grass',null),
(513,'Pansear','fire',null),
(514,'Simisear','fire',null),
(515,'Panpour','water',null),
(516,'Simipour','water',null),
(517,'Munna','psychic',null),
(518,'Musharna','psychic',null),
(519,'Pidove','normal','flying'),
(520,'Tranquill','normal','flying'),
(521,'Unfezant','normal','flying'),
(522,'Blitzle','electric',null),
(523,'Zebstrika','electric',null),
(524,'Roggenrola','rock',null),
(525,'Boldore','rock',null),
(526,'Gigalith','rock',null),
(527,'Woobat','psychic','flying'),
(528,'Swoobat','psychic','flying'),
(529,'Drilbur','ground',null),
(530,'Excadrill','ground','steel'),
(531,'Audino','normal',null),
(532,'Timburr','fighting',null),
(533,'Gurdurr','fighting',null),
(534,'Conkeldurr','fighting',null),
(535,'Tympole','water',null),
(536,'Palpitoad','water','ground'),
(537,'Seismitoad','water','ground'),
(538,'Throh','fighting',null),
(539,'Sawk','fighting',null),
(540,'Sewaddle','bug','grass'),
(541,'Swadloon','bug','grass'),
(542,'Leavanny','bug','grass'),
(543,'Venipede','bug','poison'),
(544,'Whirlipede','bug','poison'),
(545,'Scolipede','bug','poison'),
(546,'Cottonee','grass','fairy'),
(547,'Whimsicott','grass','fairy'),
(548,'Petilil','grass',null),
(549,'Lilligant','grass',null),
(550,'Basculin','water',null),
(551,'Sandile','ground','dark'),
(552,'Krokorok','ground','dark'),
(553,'Krookodile','ground','dark'),
(554,'Darumaka','fire',null),
(555,'Darmanitan','fire',null),
(556,'Maractus','grass',null),
(557,'Dwebble','bug','rock'),
(558,'Crustle','bug','rock'),
(559,'Scraggy','dark','fighting'),
(560,'Scrafty','dark','fighting'),
(561,'Sigilyph','psychic','flying'),
(562,'Yamask','ghost',null),
(563,'Cofagrigus','ghost',null),
(564,'Tirtouga','water','rock'),
(565,'Carracosta','water','rock'),
(566,'Archen','rock','flying'),
(567,'Archeops','rock','flying'),
(568,'Trubbish','poison',null),
(569,'Garbodor','poison',null),
(570,'Zorua','dark',null),
(571,'Zoroark','dark',null),
(572,'Minccino','normal',null),
(573,'Cinccino','normal',null),
(574,'Gothita','psychic',null),
(575,'Gothorita','psychic',null),
(576,'Gothitelle','psychic',null),
(577,'Solosis','psychic',null),
(578,'Duosion','psychic',null),
(579,'Reuniclus','psychic',null),
(580,'Ducklett','water','flying'),
(581,'Swanna','water','flying'),
(582,'Vanillite','ice',null),
(583,'Vanillish','ice',null),
(584,'Vanilluxe','ice',null),
(585,'Deerling','normal','grass'),
(586,'Sawsbuck','normal','grass'),
(587,'Emolga','electric','flying'),
(588,'Karrablast','bug',null),
(589,'Escavalier','bug','steel'),
(590,'Foongus','grass','poison'),
(591,'Amoonguss','grass','poison'),
(592,'Frillish','water','ghost'),
(593,'Jellicent','water','ghost'),
(594,'Alomomola','water',null),
(595,'Joltik','bug','electric'),
(596,'Galvantula','bug','electric'),
(597,'Ferroseed','grass','steel'),
(598,'Ferrothorn','grass','steel'),
(599,'Klink','steel',null),
(600,'Klang','steel',null),
(601,'Klinklang','steel',null),
(602,'Tynamo','electric',null),
(603,'Eelektrik','electric',null),
(604,'Eelektross','electric',null),
(605,'Elgyem','psychic',null),
(606,'Beheeyem','psychic',null),
(607,'Litwick','ghost','fire'),
(608,'Lampent','ghost','fire'),
(609,'Chandelure','ghost','fire'),
(610,'Axew','dragon',null),
(611,'Fraxure','dragon',null),
(612,'Haxorus','dragon',null),
(613,'Cubchoo','ice',null),
(614,'Beartic','ice',null),
(615,'Cryogonal','ice',null),
(616,'Shelmet','bug',null),
(617,'Accelgor','bug',null),
(618,'Stunfisk','ground','electric'),
(619,'Mienfoo','fighting',null),
(620,'Mienshao','fighting',null),
(621,'Druddigon','dragon',null),
(622,'Golett','ground','ghost'),
(623,'Golurk','ground','ghost'),
(624,'Pawniard','dark','steel'),
(625,'Bisharp','dark','steel'),
(626,'Bouffalant','normal',null),
(627,'Rufflet','normal','flying'),
(628,'Braviary','normal','flying'),
(629,'Vullaby','dark','flying'),
(630,'Mandibuzz','dark','flying'),
(631,'Heatmor','fire',null),
(632,'Durant','bug','steel'),
(633,'Deino','dark','dragon'),
(634,'Zweilous','dark','dragon'),
(635,'Hydreigon','dark','dragon'),
(636,'Larvesta','bug','fire'),
(637,'Volcarona','bug','fire'),
(638,'Cobalion','steel','fighting'),
(639,'Terrakion','rock','fighting'),
(640,'Virizion','grass','fighting'),
(641,'Tornadus','flying',null),
(642,'Thundurus','electric','flying'),
(643,'Reshiram','dragon','fire'),
(644,'Zekrom','dragon','electric'),
(645,'Landorus','ground','flying'),
(646,'Kyurem','dragon','ice'),
(647,'Keldeo','water','fighting'),
(648,'Meloetta','normal','psychic'),
(649,'Genesect','bug','steel'),
(650,'Chespin','grass',null),
(651,'Quilladin','grass',null),
(652,'Chesnaught','grass','fighting'),
(653,'Fennekin','fire',null),
(654,'Braixen','fire',null),
(655,'Delphox','fire','psychic'),
(656,'Froakie','water',null),
(657,'Frogadier','water',null),
(658,'Greninja','water','dark'),
(659,'Bunnelby','normal',null),
(660,'Diggersby','normal','ground'),
(661,'Fletchling','normal','flying'),
(662,'Fletchinder','fire','flying'),
(663,'Talonflame','fire','flying'),
(664,'Scatterbug','bug',null),
(665,'Spewpa','bug',null),
(666,'Vivillon','bug','flying'),
(667,'Litleo','fire','normal'),
(668,'Pyroar','fire','normal'),
(669,'Flabébé','fairy',null),
(670,'Floette','fairy',null),
(671,'Florges','fairy',null),
(672,'Skiddo','grass',null),
(673,'Gogoat','grass',null),
(674,'Pancham','fighting',null),
(675,'Pangoro','fighting','dark'),
(676,'Furfrou','normal',null),
(677,'Espurr','psychic',null),
(678,'Meowstic','psychic',null),
(679,'Honedge','steel','ghost'),
(680,'Doublade','steel','ghost'),
(681,'Aegislash','steel','ghost'),
(682,'Spritzee','fairy',null),
(683,'Aromatisse','fairy',null),
(684,'Swirlix','fairy',null),
(685,'Slurpuff','fairy',null),
(686,'Inkay','dark','psychic'),
(687,'Malamar','dark','psychic'),
(688,'Binacle','rock','water'),
(689,'Barbaracle','rock','water'),
(690,'Skrelp','poison','water'),
(691,'Dragalge','poison','dragon'),
(692,'Clauncher','water',null),
(693,'Clawitzer','water',null),
(694,'Helioptile','electric','normal'),
(695,'Heliolisk','electric','normal'),
(696,'Tyrunt','rock','dragon'),
(697,'Tyrantrum','rock','dragon'),
(698,'Amaura','rock','ice'),
(699,'Aurorus','rock','ice'),
(700,'Sylveon','fairy',null),
(701,'Hawlucha','fighting','flying'),
(702,'Dedenne','electric','fairy'),
(703,'Carbink','rock','fairy'),
(704,'Goomy','dragon',null),
(705,'Sliggoo','dragon',null),
(706,'Goodra','dragon',null),
(707,'Klefki','steel','fairy'),
(708,'Phantump','ghost','grass'),
(709,'Trevenant','ghost','grass'),
(710,'Pumpkaboo','ghost','grass'),
(711,'Gourgeist','ghost','grass'),
(712,'Bergmite','ice',null),
(713,'Avalugg','ice',null),
(714,'Noibat','flying','dragon'),
(715,'Noivern','flying','dragon'),
(716,'Xerneas','fairy',null),
(717,'Yveltal','dark','flying'),
(718,'Zygarde','dragon','ground'),
(719,'Diancie','rock','fairy'),
(720,'Hoopa','psychic','ghost'),
(721,'Volcanion','fire','water'),
(722,'Rowlet','grass','flying'),
(723,'Dartrix','grass','flying'),
(724,'Decidueye','grass','ghost'),
(725,'Litten','fire',null),
(726,'Torracat','fire',null),
(727,'Incineroar','fire','dark'),
(728,'Popplio','water',null),
(729,'Brionne','water',null),
(730,'Primarina','water','fairy'),
(731,'Pikipek','normal','flying'),
(732,'Trumbeak','normal','flying'),
(733,'Toucannon','normal','flying'),
(734,'Yungoos','normal',null),
(735,'Gumshoos','normal',null),
(736,'Grubbin','bug',null),
(737,'Charjabug','bug','electric'),
(738,'Vikavolt','bug','electric'),
(739,'Crabrawler','fighting',null),
(740,'Crabominable','fighting','ice'),
(741,'Oricorio','fire','flying'),
(742,'Cutiefly','bug','fairy'),
(743,'Ribombee','bug','fairy'),
(744,'Rockruff','rock',null),
(745,'Lycanroc','rock',null),
(746,'Wishiwashi','water',null),
(747,'Mareanie','poison','water'),
(748,'Toxapex','poison','water'),
(749,'Mudbray','ground',null),
(750,'Mudsdale','ground',null),
(751,'Dewpider','water','bug'),
(752,'Araquanid','water','bug'),
(753,'Fomantis','grass',null),
(754,'Lurantis','grass',null),
(755,'Morelull','grass','fairy'),
(756,'Shiinotic','grass','fairy'),
(757,'Salandit','poison','fire'),
(758,'Salazzle','poison','fire'),
(759,'Stufful','normal','fighting'),
(760,'Bewear','normal','fighting'),
(761,'Bounsweet','grass',null),
(762,'Steenee','grass',null),
(763,'Tsareena','grass',null),
(764,'Comfey','fairy',null),
(765,'Oranguru','normal','psychic'),
(766,'Passimian','fighting',null),
(767,'Wimpod','bug','water'),
(768,'Golisopod','bug','water'),
(769,'Sandygast','ghost','ground'),
(770,'Palossand','ghost','ground'),
(771,'Pyukumuku','water',null),
(772,'Type: Null','normal',null),
(773,'Silvally','normal',null),
(774,'Minior','rock','flying'),
(775,'Komala','normal',null),
(776,'Turtonator','fire','dragon'),
(777,'Togedemaru','electric','steel'),
(778,'Mimikyu','ghost','fairy'),
(779,'Bruxish','water','psychic'),
(780,'Drampa','normal','dragon'),
(781,'Dhelmise','ghost','grass'),
(782,'Jangmo-o','dragon',null),
(783,'Hakamo-o','dragon','fighting'),
(784,'Kommo-o','dragon','fighting'),
(785,'Tapu Koko','electric','fairy'),
(786,'Tapu Lele','psychic','fairy'),
(787,'Tapu Bulu','grass','fairy'),
(788,'Tapu Fini','water','fairy'),
(789,'Cosmog','psychic',null),
(790,'Cosmoem','psychic',null),
(791,'Solgaleo','psychic','steel'),
(792,'Lunala','psychic','ghost'),
(793,'Nihilego','rock','poison'),
(794,'Buzzwole','bug','fighting'),
(795,'Pheromosa','bug','fighting'),
(796,'Xurkitree','electric',null),
(797,'Celesteela','steel','flying'),
(798,'Kartana','grass','steel'),
(799,'Guzzlord','dark','dragon'),
(800,'Necrozma','psychic',null),
(801,'Magearna','steel','fairy'),
(802,'Marshadow','fighting','ghost'),
(803,'Poipole','poison',null),
(804,'Naganadel','poison','dragon'),
(805,'Stakataka','rock','steel'),
(806,'Blacephalon','fire','ghost'),
(807,'Zeraora','electric',null),
(808,'Meltan','steel',null),
(809,'Melmetal','steel',null),
(810,'Grookey','grass',null),
(811,'Thwackey','grass',null),
(812,'Rillaboom','grass',null),
(813,'Scorbunny','fire',null),
(814,'Raboot','fire',null),
(815,'Cinderace','fire',null),
(816,'Sobble','water',null),
(817,'Drizzile','water',null),
(818,'Inteleon','water',null),
(819,'Skwovet','normal',null),
(820,'Greedent','normal',null),
(821,'Rookidee','flying',null),
(822,'Corvisquire','flying',null),
(823,'Corviknight','flying','steel'),
(824,'Blipbug','bug',null),
(825,'Dottler','bug','psychic'),
(826,'Orbeetle','bug','psychic'),
(827,'Nickit','dark',null),
(828,'Thievul','dark',null),
(829,'Gossifleur','grass',null),
(830,'Eldegoss','grass',null),
(831,'Wooloo','normal',null),
(832,'Dubwool','normal',null),
(833,'Chewtle','water',null),
(834,'Drednaw','water','rock'),
(835,'Yamper','electric',null),
(836,'Boltund','electric',null),
(837,'Rolycoly','rock',null),
(838,'Carkol','rock','fire'),
(839,'Coalossal','rock','fire'),
(840,'Applin','grass','dragon'),
(841,'Flapple','grass','dragon'),
(842,'Appletun','grass','dragon'),
(843,'Silicobra','ground',null),
(844,'Sandaconda','ground',null),
(845,'Cramorant','flying','water'),
(846,'Arrokuda','water',null),
(847,'Barraskewda','water',null),
(848,'Toxel','electric','poison'),
(849,'Toxtricity','electric','poison'),
(850,'Sizzlipede','fire','bug'),
(851,'Centiskorch','fire','bug'),
(852,'Clobbopus','fighting',null),
(853,'Grapploct','fighting',null),
(854,'Sinistea','ghost',null),
(855,'Polteageist','ghost',null),
(856,'Hatenna','psychic',null),
(857,'Hattrem','psychic',null),
(858,'Hatterene','psychic','fairy'),
(859,'Impidimp','dark','fairy'),
(860,'Morgrem','dark','fairy'),
(861,'Grimmsnarl','dark','fairy'),
(862,'Obstagoon','dark','normal'),
(863,'Perrserker','steel',null),
(864,'Cursola','ghost',null),
(865,'Sirfetch’d','fighting',null),
(866,'Mr. Rime','ice','psychic'),
(867,'Runerigus','ground','ghost'),
(868,'Milcery','fairy',null),
(869,'Alcremie','fairy',null),
(870,'Falinks','fighting',null),
(871,'Pincurchin','electric',null),
(872,'Snom','ice','bug'),
(873,'Frosmoth','ice','bug'),
(874,'Stonjourner','rock',null),
(875,'Eiscue','ice',null),
(876,'Indeedee','psychic','normal'),
(877,'Morpeko','electric','dark'),
(878,'Cufant','steel',null),
(879,'Copperajah','steel',null),
(880,'Dracozolt','electric','dragon'),
(881,'Arctozolt','electric','ice'),
(882,'Dracovish','water','dragon'),
(883,'Arctovish','water','ice'),
(884,'Duraludon','steel','dragon'),
(885,'Dreepy','dragon','ghost'),
(886,'Drakloak','dragon','ghost'),
(887,'Dragapult','dragon','ghost'),
(888,'Zacian','fairy',null),
(889,'Zamazenta','fighting',null),
(890,'Eternatus','poison','dragon'),
(891,'Kubfu','fighting',null),
(892,'Urshifu','fighting','dark'),
(893,'Zarude','dark','grass'),
(894,'Regieleki','electric',null),
(895,'Regidrago','dragon',null),
(896,'Glastrier','ice',null),
(897,'Spectrier','ghost',null),
(898,'Calyrex','psychic','grass'),
(899,'Wyrdeer','normal','psychic'),
(900,'Kleavor','bug','rock'),
(901,'Ursaluna','ground','normal'),
(902,'Basculegion','water','ghost'),
(903,'Sneasler','fighting','poison'),
(904,'Overqwil','dark','poison'),
(905,'Enamorus','fairy','flying'),
(906,'Sprigatito','grass',null),
(907,'Floragato','grass',null),
(908,'Meowscarada','grass','dark'),
(909,'Fuecoco','fire',null),
(910,'Crocalor','fire',null),
(911,'Skeledirge','fire','ghost'),
(912,'Quaxly','water',null),
(913,'Quaxwell','water',null),
(914,'Quaquaval','water','fighting'),
(915,'Lechonk','normal',null),
(916,'Oinkologne','normal',null),
(917,'Tarountula','bug',null),
(918,'Spidops','bug',null),
(919,'Nymble','bug',null),
(920,'Lokix','bug','dark'),
(921,'Pawmi','electric',null),
(922,'Pawmo','electric','fighting'),
(923,'Pawmot','electric','fighting'),
(924,'Tandemaus','normal',null),
(925,'Maushold','normal',null),
(926,'Fidough','fairy',null),
(927,'Dachsbun','fairy',null),
(928,'Smoliv','grass','normal'),
(929,'Dolliv','grass','normal'),
(930,'Arboliva','grass','normal'),
(931,'Squawkabilly','normal','flying'),
(932,'Nacli','rock',null),
(933,'Naclstack','rock',null),
(934,'Garganacl','rock',null),
(935,'Charcadet','fire',null),
(936,'Armarouge','fire','psychic'),
(937,'Ceruledge','fire','ghost'),
(938,'Tadbulb','electric',null),
(939,'Bellibolt','electric',null),
(940,'Wattrel','electric','flying'),
(941,'Kilowattrel','electric','flying'),
(942,'Maschiff','dark',null),
(943,'Mabosstiff','dark',null),
(944,'Shroodle','poison','normal'),
(945,'Grafaiai','poison','normal'),
(946,'Bramblin','grass','ghost'),
(947,'Brambleghast','grass','ghost'),
(948,'Toedscool','ground','grass'),
(949,'Toedscruel','ground','grass'),
(950,'Klawf','rock',null),
(951,'Capsakid','grass',null),
(952,'Scovillain','grass','fire'),
(953,'Rellor','bug',null),
(954,'Rabsca','bug','psychic'),
(955,'Flittle','psychic',null),
(956,'Espathra','psychic',null),
(957,'Tinkatink','fairy','steel'),
(958,'Tinkatuff','fairy','steel'),
(959,'Tinkaton','fairy','steel'),
(960,'Wiglett','water',null),
(961,'Wugtrio','water',null),
(962,'Bombirdier','flying','dark'),
(963,'Finizen','water',null),
(964,'Palafin','water',null),
(965,'Varoom','steel','poison'),
(966,'Revavroom','steel','poison'),
(967,'Cyclizar','dragon','normal'),
(968,'Orthworm','steel',null),
(969,'Glimmet','rock','poison'),
(970,'Glimmora','rock','poison'),
(971,'Greavard','ghost',null),
(972,'Houndstone','ghost',null),
(973,'Flamigo','flying','fighting'),
(974,'Cetoddle','ice',null),
(975,'Cetitan','ice',null),
(976,'Veluza','water','psychic'),
(977,'Dondozo','water',null),
(978,'Tatsugiri','dragon','water'),
(979,'Annihilape','fighting','ghost'),
(980,'Clodsire','poison','ground'),
(981,'Farigiraf','normal','psychic'),
(982,'Dudunsparce','normal',null),
(983,'Kingambit','dark','steel'),
(984,'Great Tusk','ground','fighting'),
(985,'Scream Tail','fairy','psychic'),
(986,'Brute Bonnet','grass','dark'),
(987,'Flutter Mane','ghost','fairy'),
(988,'Slither Wing','bug','fighting'),
(989,'Sandy Shocks','electric','ground'),
(990,'Iron Treads','ground','steel'),
(991,'Iron Bundle','ice','water'),
(992,'Iron Hands','fighting','electric'),
(993,'Iron Jugulis','dark','flying'),
(994,'Iron Moth','fire','poison'),
(995,'Iron Thorns','rock','electric'),
(996,'Frigibax','dragon','ice'),
(997,'Arctibax','dragon','ice'),
(998,'Baxcalibur','dragon','ice'),
(999,'Gimmighoul','ghost',null),
(1000,'Gholdengo','steel','ghost'),
(1001,'Wo-Chien','dark','grass'),
(1002,'Chien-Pao','dark','ice'),
(1003,'Ting-Lu','dark','ground'),
(1004,'Chi-Yu','dark','fire'),
(1005,'Roaring Moon','dragon','dark'),
(1006,'Iron Valiant','fairy','fighting'),
(1007,'Koraidon','fighting','dragon'),
(1008,'Miraidon','electric','dragon'),
(1009,'Walking Wake','water','dragon'),
(1010,'Iron Leaves','grass','psychic'),
(1011,'Dipplin','grass','dragon'),
(1012,'Poltchageist','grass','ghost'),
(1013,'Sinistcha','grass','ghost'),
(1014,'Okidogi','poison','fighting'),
(1015,'Munkidori','poison','psychic'),
(1016,'Fezandipiti','poison','fairy'),
(1017,'Ogerpon','grass',null),
(1018,'Archaludon','steel','dragon'),
(1019,'Hydrapple','grass','dragon'),
(1020,'Gouging Fire','fire','dragon'),
(1021,'Raging Bolt','electric','dragon'),
(1022,'Iron Boulder','rock','psychic'),
(1023,'Iron Crown','steel','psychic'),
(1024,'Terapagos','normal',null),
(1025,'Pecharunt','poison','ghost')
on conflict (id) do update
  set type1 = coalesce(public.species.type1, excluded.type1),
      type2 = case when public.species.type1 is null then excluded.type2 else public.species.type2 end;

create index if not exists species_name_lower_idx on public.species (lower(name));

-- ---------------------------------------------------------------------------
-- 2. XP: from "XP since last level" to TOTAL XP.
--    Level 2 = 10, 3 = 25, 4 = 45, 5 = 70, 6 = 100, 7 = 140, 8 = 200 (max).
-- ---------------------------------------------------------------------------

-- One-time conversion of existing Pokémon (runs only once, ever):
-- keep the level, carry the XP already earned inside that level on top of
-- the level's new starting total, never past the next threshold — so the
-- conversion itself can't level anything up or down.
do $$
declare
  v_totals constant jsonb := '{"2":10,"3":25,"4":45,"5":70,"6":100,"7":140,"8":200}';
begin
  -- (also skipped once PokéGear 13 has switched to per-level XP)
  if exists (select 1 from public.game_config where key = 'xp_model' and value #>> '{}' in ('total', 'per_level')) then
    return;
  end if;

  -- Dead Pokémon are normally frozen by a trigger; their XP number still
  -- has to move to the new scale, so the trigger is paused just for this.
  alter table public.trainer_pokemon disable trigger trainer_pokemon_dead_immutable;

  update public.trainer_pokemon tp
  set xp = case
    when tp.level >= 8 then 200
    else least(
      coalesce((v_totals ->> tp.level::text)::integer, 0) + greatest(tp.xp, 0),
      (v_totals ->> (tp.level + 1)::text)::integer - 1
    )
  end;

  alter table public.trainer_pokemon enable trigger trainer_pokemon_dead_immutable;

  insert into public.game_config (key, value, description)
  values ('xp_model', '"total"', 'trainer_pokemon.xp holds TOTAL XP (PokéGear 11). Do not change.')
  on conflict (key) do update set value = excluded.value;
end $$;

update public.game_config
set value = '{"2":10,"3":25,"4":45,"5":70,"6":100,"7":140,"8":200}',
    description = 'TOTAL XP needed to reach each level (PokéGear 11).'
where key = 'xp_curve';

update public.game_config set value = '8', description = 'Highest level a Pokémon can reach in this campaign.'
where key = 'max_level';

insert into public.game_config (key, value, description) values
  ('level_up_max_hp', '5', 'Max KP a Pokémon gains each time it levels up.')
on conflict (key) do nothing;

-- Total XP needed to *be* a given level (level 1 = 0). Above the curve's
-- last entry it stays at that last value.
create or replace function public.xp_for_level(p_level integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_level <= 1 then 0
    else coalesce(
      (public.get_xp_curve() ->> least(p_level, public.get_config_int('max_level', 8))::text)::integer,
      (select max((v)::integer) from jsonb_each_text(public.get_xp_curve()) as e(k, v)),
      0
    )
  end;
$$;

grant execute on function public.xp_for_level(integer) to authenticated;

-- XP can never sit below the start of the Pokémon's level (e.g. an admin
-- gives a Lv 5 Pokémon with XP 0 → stored as 70).
create or replace function public.enforce_xp_floor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_floor integer := public.xp_for_level(new.level);
begin
  if new.xp is null or new.xp < v_floor then
    new.xp := v_floor;
  end if;
  return new;
end;
$$;

drop trigger if exists trainer_pokemon_xp_floor on public.trainer_pokemon;
create trigger trainer_pokemon_xp_floor
  before insert or update of level, xp on public.trainer_pokemon
  for each row execute procedure public.enforce_xp_floor();

-- The single XP engine every path uses (battle rewards, admin grants,
-- self-edit when enabled). Adds XP to the total, processes every level-up
-- it crosses (several at once if needed), raises max KP per level, checks
-- level evolutions after each level, and stops at the max level.
create or replace function public._apply_pokemon_xp(p_pokemon_id uuid, p_amount integer, p_notify_xp boolean)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pokemon public.trainer_pokemon;
  v_max_level integer := public.get_config_int('max_level', 8);
  v_hp_per_level integer := public.get_config_int('level_up_max_hp', 5);
  v_total integer;
  v_level integer;
  v_gained integer := 0;
  v_evo_species smallint;
  v_label text;
  v_result public.trainer_pokemon;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'XP amount must be positive';
  end if;

  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then raise exception 'Pokémon not found'; end if;
  if v_pokemon.is_dead then raise exception 'This Pokémon has died and cannot gain XP'; end if;

  v_label := public._pokemon_label(p_pokemon_id);
  v_level := v_pokemon.level;

  if v_level >= v_max_level then
    -- Already at the cap: nothing changes.
    return v_pokemon;
  end if;

  v_total := greatest(v_pokemon.xp, public.xp_for_level(v_level)) + p_amount;

  loop
    exit when v_level >= v_max_level;
    exit when v_total < public.xp_for_level(v_level + 1);
    v_level := v_level + 1;
    v_gained := v_gained + 1;

    insert into public.notifications (profile_id, kind, title, body)
    values (v_pokemon.profile_id, 'level_up', 'Level up!', format('%s reached level %s!', v_label, v_level));

    select er.to_species_id into v_evo_species
    from public.evolution_rules er
    join public.trainer_pokemon tp on tp.id = p_pokemon_id
    where er.method = 'level' and er.from_species_id = tp.species_id and er.level_required <= v_level
    order by er.level_required desc
    limit 1;
    if v_evo_species is not null then
      perform public.apply_evolution(p_pokemon_id, v_evo_species);
      v_label := public._pokemon_label(p_pokemon_id);
    end if;
    v_evo_species := null;
  end loop;

  if v_level >= v_max_level then
    v_total := least(v_total, public.xp_for_level(v_max_level));
  end if;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon
  set xp = v_total,
      level = v_level,
      max_hp = max_hp + v_gained * v_hp_per_level,
      current_hp = case
        when status = 'fainted' or current_hp <= 0 then current_hp
        else current_hp + v_gained * v_hp_per_level
      end
  where id = p_pokemon_id
  returning * into v_result;

  if v_gained = 0 and p_notify_xp then
    insert into public.notifications (profile_id, kind, title, body)
    values (v_pokemon.profile_id, 'xp_gained', 'XP gained', format('%s gained %s XP.', v_label, p_amount));
  end if;

  return v_result;
end;
$$;

revoke all on function public._apply_pokemon_xp(uuid, integer, boolean) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public._apply_pokemon_xp(uuid, integer, boolean) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public._apply_pokemon_xp(uuid, integer, boolean) from authenticated;
  end if;
end $$;

-- claim_battle_xp: same as 0010, max level now comes from config (8).
create or replace function public.claim_battle_xp(p_recipient_id uuid, p_pokemon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.battle_reward_recipients;
  v_p public.trainer_pokemon;
  v_max_level integer := public.get_config_int('max_level', 8);
  v_after public.trainer_pokemon;
  v_name text;
begin
  select * into v_r from public.battle_reward_recipients where id = p_recipient_id for update;
  if v_r.id is null or not public.is_own_profile(v_r.profile_id) then
    raise exception 'Reward not found';
  end if;
  if v_r.xp_claimed_at is not null then
    raise exception 'This XP has already been given to a Pokémon';
  end if;

  select * into v_p from public.trainer_pokemon where id = p_pokemon_id;
  if v_p.id is null or v_p.profile_id <> v_r.profile_id then
    raise exception 'That Pokémon isn''t yours';
  end if;
  if v_p.is_dead then
    raise exception 'This Pokémon has died and cannot gain XP';
  end if;
  if v_p.level >= v_max_level and exists (
    select 1 from public.trainer_pokemon
    where profile_id = v_r.profile_id and not is_dead and level < v_max_level
  ) then
    raise exception '% is already at the maximum level — choose another Pokémon', public._pokemon_label(v_p.id);
  end if;

  v_name := public._pokemon_label(v_p.id);
  if v_p.level >= v_max_level then
    v_after := v_p; -- every Pokémon is maxed: the XP is recorded but has nowhere to go
  else
    v_after := public._apply_pokemon_xp(v_p.id, v_r.xp, false);
  end if;

  update public.battle_reward_recipients
  set xp_pokemon_id = v_p.id, xp_pokemon_name = v_name, xp_claimed_at = now(),
      level_before = v_p.level, level_after = v_after.level
  where id = v_r.id;

  return jsonb_build_object(
    'pokemon_id', v_p.id, 'name', v_name, 'xp', v_r.xp,
    'level_before', v_p.level, 'level_after', v_after.level,
    'species_before', v_p.species_id, 'species_after', v_after.species_id,
    'species_after_name', (select name from public.species where id = v_after.species_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Team / PC integrity
-- ---------------------------------------------------------------------------
-- The table already guarantees "exactly one place: a team slot OR a box
-- slot". What it did NOT guarantee: that the box belongs to the Pokémon's
-- owner, and that the slot fits inside the box. A Pokémon breaking either
-- rule exists but is drawn nowhere in the PC. Repair those, then prevent
-- them for good.

-- find_open_slot that also creates a new box if every existing one is full
-- (instead of returning nothing).
create or replace function public.find_or_make_slot(p_profile_id uuid)
returns public.pokemon_location
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.pokemon_location;
  v_next integer;
  v_box uuid;
begin
  v_slot := public.find_open_slot(p_profile_id);
  if v_slot.party_slot is not null or v_slot.box_id is not null then
    return v_slot;
  end if;
  select coalesce(max(box_number), 0) + 1 into v_next from public.pc_boxes where profile_id = p_profile_id;
  if v_next > 32 then
    raise exception 'This trainer''s PC is completely full';
  end if;
  insert into public.pc_boxes (profile_id, box_number, name) values (p_profile_id, v_next, 'Box ' || v_next)
  returning id into v_box;
  v_slot.box_id := v_box;
  v_slot.box_slot := 1;
  return v_slot;
end;
$$;

-- Admin-only repair: moves every misplaced Pokémon to a free slot of its
-- owner. Returns what it moved. Safe to run any time.
create or replace function public.repair_pokemon_locations()
returns table (pokemon_id uuid, owner text, pokemon text, problem text, moved_to text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_slot public.pokemon_location;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only the Game Master can run the repair';
  end if;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);

  for r in
    select tp.id, tp.profile_id, p.username, coalesce(tp.nickname, s.name) as label,
           case
             when b.id is null then 'box does not exist'
             when b.profile_id <> tp.profile_id then 'box belongs to another trainer'
             else format('slot %s is outside box %s (size %s)', tp.box_slot, b.box_number, b.capacity)
           end as why
    from public.trainer_pokemon tp
    join public.profiles p on p.id = tp.profile_id
    join public.species s on s.id = tp.species_id
    left join public.pc_boxes b on b.id = tp.box_id
    where tp.party_slot is null
      and (b.id is null or b.profile_id <> tp.profile_id or tp.box_slot > b.capacity)
    order by tp.caught_at
  loop
    v_slot := public.find_or_make_slot(r.profile_id);
    update public.trainer_pokemon
    set party_slot = v_slot.party_slot, box_id = v_slot.box_id, box_slot = v_slot.box_slot
    where id = r.id;

    insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
    values (public.my_profile_id(), 'pokemon_location_repaired', r.profile_id,
            jsonb_build_object('pokemon_id', r.id, 'pokemon', r.label, 'problem', r.why));

    pokemon_id := r.id;
    owner := r.username;
    pokemon := r.label;
    problem := r.why;
    moved_to := case when v_slot.party_slot is not null then 'Team slot ' || v_slot.party_slot
                     else 'PC ' || (select name from public.pc_boxes where id = v_slot.box_id) || ', slot ' || v_slot.box_slot end;
    return next;
  end loop;
end;
$$;

grant execute on function public.repair_pokemon_locations() to authenticated;

-- Run the repair now (as the migration owner).
select * from public.repair_pokemon_locations();

-- From now on: a box must belong to the Pokémon's owner and the slot must
-- fit in it — for everyone, admins included. During a battle a trainer
-- can't rearrange their team.
create or replace function public.validate_pokemon_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.pc_boxes;
  v_moved boolean;
begin
  if new.box_id is not null then
    select * into v_box from public.pc_boxes where id = new.box_id;
    if v_box.id is null then
      raise exception 'That PC box does not exist';
    end if;
    if v_box.profile_id <> new.profile_id then
      raise exception 'A Pokémon can only be stored in its own trainer''s PC';
    end if;
    if new.box_slot < 1 or new.box_slot > v_box.capacity then
      raise exception 'That box only has % slots', v_box.capacity;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(current_setting('pokegear.bypass_pokemon_guard', true), '') <> 'on'
     and auth.uid() is not null
     and not public.is_admin() then
    v_moved := new.party_slot is distinct from old.party_slot
            or new.box_id is distinct from old.box_id
            or new.box_slot is distinct from old.box_slot;
    if v_moved and (old.party_slot is not null or new.party_slot is not null)
       and public.is_in_active_battle(new.profile_id) then
      raise exception 'You can''t change your team during a battle';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trainer_pokemon_validate_location on public.trainer_pokemon;
create trigger trainer_pokemon_validate_location
  before insert or update of profile_id, party_slot, box_id, box_slot on public.trainer_pokemon
  for each row execute procedure public.validate_pokemon_location();

-- "The Team can never end up empty" for trainer-initiated moves. Checked at
-- COMMIT (deferred), so a swap that briefly empties the Team mid-way works.
create or replace function public.check_team_not_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('pokegear.bypass_pokemon_guard', true), '') = 'on'
     or auth.uid() is null
     or public.is_admin() then
    return null;
  end if;
  if old.party_slot is not null and new.party_slot is null
     and not exists (select 1 from public.trainer_pokemon where profile_id = new.profile_id and party_slot is not null) then
    raise exception 'Your Team can''t be empty — keep at least one Pokémon in it';
  end if;
  return null;
end;
$$;

drop trigger if exists trainer_pokemon_team_not_empty on public.trainer_pokemon;
create constraint trigger trainer_pokemon_team_not_empty
  after update of party_slot on public.trainer_pokemon
  deferrable initially deferred
  for each row execute procedure public.check_team_not_empty();

-- A box can't shrink below a Pokémon stored in it.
create or replace function public.guard_box_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.capacity < old.capacity and exists (
    select 1 from public.trainer_pokemon where box_id = new.id and box_slot > new.capacity
  ) then
    raise exception 'There are Pokémon stored beyond slot % in this box — move them first', new.capacity;
  end if;
  return new;
end;
$$;

drop trigger if exists pc_boxes_capacity_guard on public.pc_boxes;
create trigger pc_boxes_capacity_guard
  before update of capacity on public.pc_boxes
  for each row execute procedure public.guard_box_capacity();

-- One-tap moves used by the Team and PC screens.
create or replace function public.move_pokemon_to_team(p_pokemon_id uuid)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.trainer_pokemon;
  v_slot smallint;
  v_result public.trainer_pokemon;
begin
  select * into v_p from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_p.id is null or not (public.is_own_profile(v_p.profile_id) or public.is_admin()) then
    raise exception 'Pokémon not found';
  end if;
  if v_p.party_slot is not null then
    return v_p;
  end if;
  perform 1 from public.profiles where id = v_p.profile_id for update; -- serialize moves per trainer
  select gs into v_slot from generate_series(1, 6) gs
  where not exists (select 1 from public.trainer_pokemon where profile_id = v_p.profile_id and party_slot = gs)
  order by gs limit 1;
  if v_slot is null then
    raise exception 'Your Team is full (6/6). Move a Pokémon to the PC first.';
  end if;
  update public.trainer_pokemon set party_slot = v_slot, box_id = null, box_slot = null
  where id = p_pokemon_id returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.move_pokemon_to_pc(p_pokemon_id uuid)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.trainer_pokemon;
  v_box record;
  v_slot smallint;
  v_result public.trainer_pokemon;
begin
  select * into v_p from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_p.id is null or not (public.is_own_profile(v_p.profile_id) or public.is_admin()) then
    raise exception 'Pokémon not found';
  end if;
  if v_p.party_slot is null then
    return v_p;
  end if;
  perform 1 from public.profiles where id = v_p.profile_id for update;
  for v_box in select id, capacity from public.pc_boxes where profile_id = v_p.profile_id order by box_number loop
    select gs into v_slot from generate_series(1, v_box.capacity) gs
    where not exists (select 1 from public.trainer_pokemon where box_id = v_box.id and box_slot = gs)
    order by gs limit 1;
    if v_slot is not null then
      update public.trainer_pokemon set party_slot = null, box_id = v_box.id, box_slot = v_slot
      where id = p_pokemon_id returning * into v_result;
      return v_result;
    end if;
  end loop;
  raise exception 'Your PC is full';
end;
$$;

grant execute on function public.move_pokemon_to_team(uuid) to authenticated;
grant execute on function public.move_pokemon_to_pc(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Virtual Pokémon TCG cards (data from TCGdex, no API key needed)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists tcg_language text not null default 'en';
alter table public.profiles drop constraint if exists profiles_tcg_language_check;
alter table public.profiles add constraint profiles_tcg_language_check
  check (tcg_language in ('en', 'de', 'fr', 'it', 'es', 'pt-br'));

-- One row per (trainer, card, language) with a copy count. The card's
-- details are a snapshot of what TCGdex returned when it was added; the
-- detail view re-reads TCGdex live and only falls back to the snapshot.
create table if not exists public.tcg_collection (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  card_id      text not null check (card_id ~ '^[A-Za-z0-9._-]{1,64}$'),
  lang         text not null check (lang in ('en', 'de', 'fr', 'it', 'es', 'pt-br')),
  quantity     integer not null default 1 check (quantity between 1 and 999),
  is_favorite  boolean not null default false,
  name         text not null check (char_length(name) between 1 and 120),
  category     text,
  dex_ids      integer[] not null default '{}',
  set_id       text,
  set_name     text,
  local_id     text,
  set_total    integer,
  rarity       text,
  hp           integer,
  types        text[] not null default '{}',
  image_url    text check (image_url is null or image_url ~ '^https://assets\.tcgdex\.net/[A-Za-z0-9._/-]+$'),
  card_data    jsonb not null default '{}'::jsonb,
  added_at     timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (profile_id, card_id, lang)
);

create index if not exists tcg_collection_profile_idx on public.tcg_collection (profile_id, added_at desc);

create table if not exists public.tcg_card_links (
  id             uuid primary key default gen_random_uuid(),
  collection_id  uuid not null references public.tcg_collection (id) on delete cascade,
  pokemon_id     uuid not null references public.trainer_pokemon (id) on delete cascade,
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (collection_id, pokemon_id)
);

create index if not exists tcg_card_links_pokemon_idx on public.tcg_card_links (pokemon_id);
create index if not exists tcg_card_links_profile_idx on public.tcg_card_links (profile_id);

alter table public.tcg_collection enable row level security;
alter table public.tcg_card_links enable row level security;

-- Read: your own cards; the Game Master can view everyone's. No write
-- policies at all — every change goes through the functions below.
drop policy if exists "tcg_collection_select" on public.tcg_collection;
create policy "tcg_collection_select" on public.tcg_collection for select to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());

drop policy if exists "tcg_card_links_select" on public.tcg_card_links;
create policy "tcg_card_links_select" on public.tcg_card_links for select to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());

create or replace function public.tcg_add_card(p_card jsonb, p_lang text)
returns public.tcg_collection
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.my_profile_id();
  v_id text := p_card ->> 'id';
  v_image text := nullif(p_card ->> 'image', '');
  v_dex jsonb := case when jsonb_typeof(p_card -> 'dexId') = 'array' then p_card -> 'dexId' else '[]'::jsonb end;
  v_types jsonb := case when jsonb_typeof(p_card -> 'types') = 'array' then p_card -> 'types' else '[]'::jsonb end;
  v_row public.tcg_collection;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if p_lang is null or p_lang not in ('en', 'de', 'fr', 'it', 'es', 'pt-br') then
    raise exception 'Unsupported card language';
  end if;
  if v_id is null or v_id !~ '^[A-Za-z0-9._-]{1,64}$' then raise exception 'Invalid card'; end if;
  if coalesce(p_card ->> 'name', '') = '' then raise exception 'Invalid card'; end if;
  if pg_column_size(p_card) > 60000 then raise exception 'Card data too large'; end if;
  -- Only TCGdex's own image host is accepted; anything else is dropped.
  if v_image is not null and v_image !~ '^https://assets\.tcgdex\.net/[A-Za-z0-9._/-]+$' then
    v_image := null;
  end if;

  insert into public.tcg_collection
    (profile_id, card_id, lang, name, category, dex_ids, set_id, set_name, local_id, set_total,
     rarity, hp, types, image_url, card_data)
  values (
    v_me, v_id, p_lang,
    left(p_card ->> 'name', 120),
    left(p_card ->> 'category', 40),
    coalesce((select array_agg(x::integer) from jsonb_array_elements_text(v_dex) x where x ~ '^\d{1,4}$'), '{}'),
    left(p_card #>> '{set,id}', 64),
    left(p_card #>> '{set,name}', 120),
    left(p_card ->> 'localId', 32),
    case when (p_card #>> '{set,cardCount,official}') ~ '^\d{1,5}$' then (p_card #>> '{set,cardCount,official}')::integer end,
    left(p_card ->> 'rarity', 60),
    case when (p_card ->> 'hp') ~ '^\d{1,4}$' then (p_card ->> 'hp')::integer end,
    coalesce((select array_agg(left(x, 30)) from jsonb_array_elements_text(v_types) x), '{}'),
    v_image,
    jsonb_strip_nulls(jsonb_build_object(
      'category', p_card -> 'category', 'illustrator', p_card -> 'illustrator', 'stage', p_card -> 'stage',
      'evolveFrom', p_card -> 'evolveFrom', 'description', p_card -> 'description', 'suffix', p_card -> 'suffix',
      'attacks', p_card -> 'attacks', 'abilities', p_card -> 'abilities', 'weaknesses', p_card -> 'weaknesses',
      'resistances', p_card -> 'resistances', 'retreat', p_card -> 'retreat', 'effect', p_card -> 'effect',
      'trainerType', p_card -> 'trainerType', 'energyType', p_card -> 'energyType', 'regulationMark', p_card -> 'regulationMark'
    ))
  )
  on conflict (profile_id, card_id, lang) do update
    set quantity = least(public.tcg_collection.quantity + 1, 999), updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- Removes one copy (or all with p_all). If fewer copies remain than links,
-- the newest links go first. The Pokémon themselves are never touched.
create or replace function public.tcg_remove_card(p_collection_id uuid, p_all boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tcg_collection;
  v_left integer;
begin
  select * into v_row from public.tcg_collection where id = p_collection_id for update;
  if v_row.id is null or not public.is_own_profile(v_row.profile_id) then
    raise exception 'Card not found';
  end if;
  v_left := case when p_all then 0 else v_row.quantity - 1 end;
  if v_left <= 0 then
    delete from public.tcg_collection where id = p_collection_id;
    return 0;
  end if;
  update public.tcg_collection set quantity = v_left, updated_at = now() where id = p_collection_id;
  delete from public.tcg_card_links where id in (
    select id from public.tcg_card_links where collection_id = p_collection_id
    order by created_at desc offset v_left
  );
  return v_left;
end;
$$;

create or replace function public.tcg_set_favorite(p_collection_id uuid, p_favorite boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tcg_collection set is_favorite = p_favorite, updated_at = now()
  where id = p_collection_id and public.is_own_profile(profile_id);
  if not found then raise exception 'Card not found'; end if;
end;
$$;

create or replace function public.tcg_link_card(p_collection_id uuid, p_pokemon_id uuid)
returns public.tcg_card_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.tcg_collection;
  v_p public.trainer_pokemon;
  v_links integer;
  v_row public.tcg_card_links;
begin
  select * into v_card from public.tcg_collection where id = p_collection_id for update;
  if v_card.id is null or not public.is_own_profile(v_card.profile_id) then
    raise exception 'Card not found';
  end if;
  select * into v_p from public.trainer_pokemon where id = p_pokemon_id;
  if v_p.id is null or v_p.profile_id <> v_card.profile_id then
    raise exception 'That Pokémon isn''t yours';
  end if;
  if not (v_p.species_id = any(v_card.dex_ids)) then
    raise exception 'This card shows a different Pokémon';
  end if;
  if exists (select 1 from public.tcg_card_links where collection_id = p_collection_id and pokemon_id = p_pokemon_id) then
    raise exception 'This card is already linked to that Pokémon';
  end if;
  select count(*) into v_links from public.tcg_card_links where collection_id = p_collection_id;
  if v_links >= v_card.quantity then
    raise exception 'Every copy of this card is already linked (% of %)', v_links, v_card.quantity;
  end if;
  insert into public.tcg_card_links (collection_id, pokemon_id, profile_id)
  values (p_collection_id, p_pokemon_id, v_card.profile_id)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.tcg_unlink_card(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tcg_card_links where id = p_link_id and public.is_own_profile(profile_id);
  if not found then raise exception 'Link not found'; end if;
end;
$$;

grant execute on function public.tcg_add_card(jsonb, text) to authenticated;
grant execute on function public.tcg_remove_card(uuid, boolean) to authenticated;
grant execute on function public.tcg_set_favorite(uuid, boolean) to authenticated;
grant execute on function public.tcg_link_card(uuid, uuid) to authenticated;
grant execute on function public.tcg_unlink_card(uuid) to authenticated;

-- A traded Pokémon leaves its old owner's card links behind (the card stays
-- in the old owner's collection).
create or replace function public.drop_card_links_on_owner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is distinct from old.profile_id then
    delete from public.tcg_card_links where pokemon_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trainer_pokemon_drop_card_links on public.trainer_pokemon;
create trigger trainer_pokemon_drop_card_links
  after update of profile_id on public.trainer_pokemon
  for each row execute procedure public.drop_card_links_on_owner_change();

-- Internal helpers shouldn't be callable from the API.
do $$
declare
  f text;
begin
  foreach f in array array['public.find_or_make_slot(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on function %s from authenticated', f); end if;
  end loop;
end $$;
