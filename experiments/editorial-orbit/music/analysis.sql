-- My Apple Music library, in SQL (SQLite)
-- One table, tracks, built from the Music app's library export by
-- tools/build_music_data.py (file paths, IDs and playlist names are dropped).
-- Each block below is one question; the page shows them as written here.

-- name: clean
-- Apple uses 100+ genre labels, with duplicates like "Hip-Hop/Rap",
-- "Hip Hop/Rap", "Hip-Hop" and "Rap". Group them into families.
CREATE VIEW songs AS
SELECT *,
  CASE
    WHEN genre IN ('Country', 'Contemporary Country', 'Traditional Country', 'Alternative Country',
                   'Outlaw Country', 'Honky Tonk', 'Americana', 'Country Gospel') THEN 'Country'
    WHEN genre IN ('Hip-Hop/Rap', 'Hip Hop/Rap', 'Hip-Hop', 'Rap', 'West Coast Rap', 'Gangsta Rap',
                   'Underground Rap', 'Hardcore Rap', 'Dirty South', 'Alternative Rap') THEN 'Hip-Hop/Rap'
    WHEN genre IN ('Pop', 'Indie Pop', 'Vocal Pop', 'K-Pop', 'Pop/Rock', 'Adult Contemporary') THEN 'Pop'
    WHEN genre IN ('R&B/Soul', 'Soul', 'Neo-Soul', 'Contemporary R&B') THEN 'R&B/Soul'
    WHEN genre IN ('Rock', 'Alternative', 'Hard Rock', 'Indie Rock', 'Soft Rock', 'Rock & Roll', 'Punk',
                   'Metal', 'Adult Alternative', 'Folk-Rock', 'New Wave', 'British Invasion', 'Hardcore',
                   'Alternative Folk') THEN 'Rock & Alternative'
    WHEN genre IN ('Dance', 'Electronic', 'Electronica', 'House', 'Bass', 'Afro House', 'Downtempo',
                   'Disco') THEN 'Dance & Electronic'
    ELSE 'Everything else'
  END AS genre_family
FROM tracks;

-- name: overview
SELECT COUNT(*)                                          AS songs,
       SUM(play_count)                                   AS plays,
       SUM(skip_count)                                   AS skips,
       COUNT(DISTINCT artist)                            AS artists,
       ROUND(100.0 * SUM(play_count = 0) / COUNT(*), 1)  AS pct_never_played,
       ROUND(SUM(play_count * duration_ms) / 3600000.0)  AS hours_if_played_in_full,
       MIN(substr(date_added, 1, 4))                     AS first_year
FROM songs;

-- name: genre_mix
-- What I save vs what I play: each family's share of the library and of plays.
SELECT genre_family,
       COUNT(*)                                                             AS songs,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM songs), 1)            AS pct_of_library,
       SUM(play_count)                                                      AS plays,
       ROUND(100.0 * SUM(play_count) / (SELECT SUM(play_count) FROM songs), 1) AS pct_of_plays
FROM songs
GROUP BY genre_family
ORDER BY plays DESC;

-- name: top_artists
SELECT artist,
       SUM(play_count)                                                      AS plays,
       COUNT(*)                                                             AS songs,
       ROUND(100.0 * SUM(play_count) / (SELECT SUM(play_count) FROM songs), 1) AS pct_of_plays
FROM songs
GROUP BY artist
ORDER BY plays DESC
LIMIT 10;

-- name: concentration
-- How much of my listening comes from a handful of artists?
WITH by_artist AS (
  SELECT artist, SUM(play_count) AS plays,
         ROW_NUMBER() OVER (ORDER BY SUM(play_count) DESC) AS rank
  FROM songs GROUP BY artist
)
SELECT ROUND(100.0 * SUM(CASE WHEN rank <= 10 THEN plays END) / SUM(plays), 1) AS top_10_share,
       ROUND(100.0 * SUM(CASE WHEN rank = 1 THEN plays END) / SUM(plays), 1)   AS top_1_share,
       SUM(plays > 0)                                                          AS artists_played
FROM by_artist;

-- name: top_songs
SELECT name, artist, play_count AS plays
FROM songs
ORDER BY play_count DESC, skip_count ASC
LIMIT 10;

-- name: growth
-- Songs added per year, with the empty years filled in.
WITH RECURSIVE years(y) AS (
  SELECT 2007 UNION ALL SELECT y + 1 FROM years WHERE y < 2026
)
SELECT y AS year, COUNT(s.track_id) AS songs_added
FROM years
LEFT JOIN songs AS s ON CAST(substr(s.date_added, 1, 4) AS INTEGER) = y
GROUP BY y
ORDER BY y;

-- name: never_played
-- The save-it-for-later pile, by the year the songs were added.
SELECT substr(date_added, 1, 4)                        AS year_added,
       COUNT(*)                                        AS songs_added,
       ROUND(100.0 * SUM(play_count = 0) / COUNT(*), 1) AS pct_never_played
FROM songs
WHERE date_added >= '2020'
GROUP BY year_added
ORDER BY year_added;

-- name: skips
-- Skip rate by artist. Small sample size, very high variance: so only
-- artists with at least 150 plays and skips combined.
WITH rates AS (
  SELECT artist,
         SUM(play_count) AS plays,
         SUM(skip_count) AS skips,
         ROUND(100.0 * SUM(skip_count) / (SUM(play_count) + SUM(skip_count)), 1) AS skip_rate
  FROM songs
  GROUP BY artist
  HAVING SUM(play_count) + SUM(skip_count) >= 150
)
SELECT * FROM (SELECT 'most skipped' AS list, * FROM rates ORDER BY skip_rate DESC LIMIT 5)
UNION ALL
SELECT * FROM (SELECT 'least skipped' AS list, * FROM rates ORDER BY skip_rate ASC LIMIT 5);

-- name: decades
SELECT (year / 10) * 10 AS decade, SUM(play_count) AS plays, COUNT(*) AS songs
FROM songs
WHERE year >= 1950
GROUP BY decade
ORDER BY decade;
