// Shortcut tiles. Edit SITES to add/remove entries: ['Name', 'address.com']
(function () {
	var SITES = {
		Games: [['Poki','poki.com'],['now.gg','now.gg'],['CrazyGames','crazygames.com'],['Coolmath Games','coolmathgames.com'],
			['Chess.com','chess.com'],['itch.io','itch.io'],['Y8 Games','y8.com'],['Miniclip','miniclip.com'],
			['1v1.LOL','1v1.lol'],['Nitro Type','nitrotype.com'],['Blooket','blooket.com'],['Kahoot','kahoot.it'],
			['GeoGuessr','geoguessr.com'],['Lichess','lichess.org'],['Tetris','tetris.com'],['Wordle','nytimes.com/games/wordle'],
			['Scratch','scratch.mit.edu']],
		Streaming: [['YouTube','youtube.com'],['Netflix','netflix.com'],['Hulu','hulu.com'],['Disney+','disneyplus.com'],
			['Prime Video','primevideo.com'],['Tubi','tubitv.com'],['Twitch','twitch.tv'],['Spotify','open.spotify.com'],
			['Pluto TV','pluto.tv'],['Apple Music','music.apple.com'],['Crunchyroll','crunchyroll.com'],['SoundCloud','soundcloud.com'],
			['Peacock','peacocktv.com'],['Plex','watch.plex.tv']],
		AI: [['ChatGPT','chatgpt.com'],['Claude','claude.ai'],['Gemini','gemini.google.com'],['Perplexity','perplexity.ai']],
		Social: [['Reddit','reddit.com'],['X','x.com'],['Instagram','instagram.com'],['TikTok','tiktok.com'],
			['Discord','discord.com'],['Pinterest','pinterest.com']],
		School: [['Khan Academy','khanacademy.org'],['Wikipedia','wikipedia.org'],['Quizlet','quizlet.com'],
			['Desmos','desmos.com'],['Google Docs','docs.google.com'],['Duolingo','duolingo.com']],
		'Tools & News': [['Google','google.com'],['DuckDuckGo','duckduckgo.com'],['BBC News','bbc.com'],
			['Weather','weather.com'],['GitHub','github.com']],
		Shopping: [['Amazon','amazon.com'],['eBay','ebay.com'],['Etsy','etsy.com'],['Walmart','walmart.com'],['Target','target.com']]
	};

	var formEl = document.getElementById('sj-form');
	var addrEl = document.getElementById('sj-address');
	var root = document.getElementById('directory');
	var tabsEl = document.getElementById('dir-tabs');
	var sections = [];

	function hue(s) {
		var n = 0;
		for (var i = 0; i < s.length; i++) n += s.charCodeAt(i);
		return (n * 37) % 360;
	}

	Object.keys(SITES).forEach(function (cat) {
		var sec = document.createElement('section');
		sec.dataset.c = cat;
		var h = document.createElement('h2');
		h.textContent = cat;
		var grid = document.createElement('div');
		grid.className = 'dir-grid';
		SITES[cat].forEach(function (s) {
			var tile = document.createElement('button');
			tile.type = 'button';
			tile.className = 'dir-tile';
			var hu = hue(s[0]);
			var ic = document.createElement('span');
			ic.className = 'dir-ic';
			ic.style.background = 'hsl(' + hu + ' 80% 90%)';
			ic.style.color = 'hsl(' + hu + ' 60% 35%)';
			ic.textContent = s[0][0].toUpperCase();
			var txt = document.createElement('span');
			var b = document.createElement('b');
			b.textContent = s[0];
			var sm = document.createElement('small');
			sm.textContent = s[1].split('/')[0];
			txt.appendChild(b);
			txt.appendChild(sm);
			tile.appendChild(ic);
			tile.appendChild(txt);
			tile.addEventListener('click', function () {
				addrEl.value = 'https://' + s[1];
				formEl.requestSubmit();
			});
			grid.appendChild(tile);
		});
		sec.appendChild(h);
		sec.appendChild(grid);
		root.appendChild(sec);
		sections.push(sec);
	});

	['All'].concat(Object.keys(SITES)).forEach(function (c, i) {
		var btn = document.createElement('button');
		btn.type = 'button';
		btn.textContent = c;
		if (i === 0) btn.className = 'on';
		btn.addEventListener('click', function () {
			Array.prototype.forEach.call(tabsEl.children, function (x) { x.classList.remove('on'); });
			btn.classList.add('on');
			sections.forEach(function (s) {
				s.style.display = (c === 'All' || s.dataset.c === c) ? '' : 'none';
			});
		});
		tabsEl.appendChild(btn);
	});

	// hide the directory once a page is opened; the Home button reloads it
	formEl.addEventListener('submit', function () {
		document.body.classList.add('browsing');
	});
})();
