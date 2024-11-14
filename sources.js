const { parse } = require("fast-html-parser");
const config = require('./config');
require('dotenv').config();
const cheerio = require('cheerio');
const axios = require('axios').default;
const nameToImdb = require("name-to-imdb");

const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: (0.5 * 60 * 60), checkperiod: (1 * 60 * 60) });
const StreamCache = new NodeCache({ stdTTL: (0.5 * 60 * 60), checkperiod: (1 * 60 * 60) });
const MetaCache = new NodeCache({ stdTTL: (0.5 * 60 * 60), checkperiod: (1 * 60 * 60) });
const CatalogCache = new NodeCache({ stdTTL: (0.5 * 60 * 60), checkperiod: (1 * 60 * 60) });



client = axios.create({
    baseURL: config.BaseURL,
    timeout: 10000
});



async function stream(einthusan_id) {
    try {
        // Check if einthusan_id is a ttNumber
        const isTtNumber = einthusan_id.startsWith("tt");
        if (isTtNumber) {
            // If it's a ttNumber, get the title first
            const title = await ttnumberToTitle(einthusan_id);
            if (title) {
                // Then get the Einthusan ID from the title
                einthusan_id = await getEinthusanIdByTitle(title, 'hindi'); // Specify language if needed
            } else {
                throw new Error("Unable to retrieve title for ttNumber: " + einthusan_id);
            }
        }

        const id = einthusan_id;
        const url = `${config.BaseURL}/movie/watch/${id}/`;
        const res = await client.get(url);

        if (res.status !== 200) {
            throw new Error(`Failed to fetch the page. Status code: ${res.status}`);
        }

        const $ = cheerio.load(res.data);
        const videoSection = $('#UIVideoPlayer');
        let title = videoSection.attr("data-content-title");
        if (!videoSection.length) {
            throw new Error("Video player section not found in the HTML.");
        }

        let mp4Link = videoSection.attr('data-mp4-link');
        console.log("MP4 Link:", mp4Link);

        const replaceIpInLink = (link) => {
            const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
            const ipMatch = link.match(ipRegex);
            if (ipMatch) {
                const ipAddress = ipMatch[0];
                console.log("Extracted IP Address:", ipAddress);
                const newBaseUrl = 'cdn1.einthusan.io';
                return link.replace(ipAddress, newBaseUrl);
            }
            return link;
        };

        const streams = [];
        if (mp4Link) {
            mp4Link = replaceIpInLink(mp4Link);
            console.log("Modified MP4 Link:", mp4Link);
            streams.push({
                url: mp4Link,
                name: 'EinthusanTV',
                title: title,
            });
        }

        if (streams.length === 0) {
            throw new Error("No video source found");
        }

        return { streams };
    } catch (e) {
        console.error("Error in stream function:", e);
        return Promise.reject(e);
    }
}

async function meta(einthusan_id , lang) {
    try {
        // Check if einthusan_id is a ttNumber
        const isTtNumber = einthusan_id.startsWith("tt");
        if (isTtNumber) {
            console.log("Fetching title for ttNumber:", einthusan_id);
            // If it's a ttNumber, get the title first
            const title = await ttnumberToTitle(einthusan_id);
            if (!title) {
                throw new Error("Unable to retrieve title for ttNumber: " + einthusan_id);
            }
            console.log("Title found for ttNumber:", title);

            // Get the Einthusan ID from the title
            einthusan_id = await getEinthusanIdByTitle(title, lang); // Specify language if needed
            if (!einthusan_id) {
                throw new Error("Einthusan ID could not be found for title: " + title);
            }
            console.log("Einthusan ID found for title:", einthusan_id);
        }

        // Ensure einthusan_id is defined
        if (!einthusan_id) {
            throw new Error("Invalid Einthusan ID format or undefined ID.");
        }

        // Attempt to get the cached meta object
        const Cached = MetaCache.get(einthusan_id);
        if (Cached) return Cached;

        // Fetch metadata if not cached
        const url = `/movie/watch/${einthusan_id}/`;
        const res = await client.get(url);
        if (!res || !res.data) throw new Error("Error requesting metadata");

        // Parse the HTML response to extract metadata
        const html = parse(res.data);
        const movie_description = html.querySelector("#UIMovieSummary").querySelector("li");
        const img = movie_description.querySelector("div.block1 a img").rawAttributes['src'];
        const year = movie_description.querySelector("div.info p").childNodes[0].rawText;
        const title = movie_description.querySelector("a.title h3").rawText;
        const description = movie_description.querySelector("p.synopsis").rawText;
        const actorsArray = html.querySelectorAll("div.prof p");
        let trailer = html.querySelectorAll("div.extras a")[1];
        
        trailer = trailer && trailer.rawAttributes['href'] 
            ? trailer.rawAttributes['href'].split("v=")[1] 
            : false;

        // Extract actors
        let actors = actorsArray.map(actor => actor.rawText);

        // Construct metadata object without `genres`
        let metaObj = {
            id: einthusan_id,
            name: title,
            posterShape: 'poster',
            type: 'movie',
            releaseInfo: year,
            poster: img ? `https:${img}` : null,
            background: img ? `https:${img}` : null,
            description,
            cast: actors,
            trailers: trailer ? [{ source: trailer, type: "Trailer" }] : []
        };

        // Cache the meta object
        MetaCache.set(einthusan_id, metaObj);
        return metaObj;
    } catch (e) {
        console.error("Error in meta function:", e);
        return Promise.reject(e);
    }
}





async function search(lang, slug) {
    try {
        const CacheID = slug + "_" + lang
        slug = encodeURI(slug);
     
        const url = `/movie/results/?lang=${lang}&query=${slug}`;
        console.log('search url:', url);
        let res = cache.get(CacheID);
        if (!res) {
            while (!res || res.length == 0) {
                res = await getcatalogresults(url);
            }
        }
        cache.set(CacheID, res);
        return res;
    } catch (e) {
        console.error(e);
        return Promise.reject(e);
    }
}

async function getImdbId(title) {
    return new Promise((resolve, reject) => {
        nameToImdb(title, (err, res, inf) => {
            if (err) {
                console.error(`Error fetching IMDb ID for title "${title}":`, err);
                return resolve(null); // Resolve with null if there's an error
            }
            resolve(res); // Resolve with the IMDb ID
        });
    });
}

async function getcatalogresults(url) {
    try {
        const Cached = CatalogCache.get(url);
        if (Cached) return Cached;

        const res = await client.get(url);
        if (!res || !res.data) throw new Error("Error in getcatalogresults: Failed to retrieve catalog results");

        const html = parse(res.data);
        let search_results = html.querySelector("#UIMovieSummary");

        if (search_results) {
            search_results = search_results.querySelectorAll("li");
        } else {
            return [];
        }

        let resultsarray = [];
        for (let i = 0; i < search_results.length; i++) {
            const img = search_results[i].querySelector("div.block1 a img")?.rawAttributes?.src;
            const year = search_results[i].querySelector("div.info p")?.childNodes[0]?.rawText.trim();
            const title = search_results[i].querySelector("a.title h3")?.rawText.trim();
            const Einthusanid = search_results[i].querySelector("a.title")?.rawAttributes?.href;

            if (img && year && title && Einthusanid) {
                const IMDbid = await getImdbId(title); // Fetch IMDb ID for each title

                resultsarray.push({
                    id: IMDbid, // Include the IMDb ID in the result
                    EinthusanID: Einthusanid.split('/')[3],
                    type: "movie",
                    name: title,
                    poster: img.startsWith('http') ? img : "https:" + img,
                    releaseInfo: year,
                    posterShape: 'poster',
                });
            }
        }

        if (resultsarray.length) CatalogCache.set(url, resultsarray);
        console.log('resultsarray:', resultsarray);
        return resultsarray;

    } catch (e) {
        console.error("Error in getcatalogresults:", e);
        return Promise.reject(e);
    }
}

async function getEinthusanIdByTitle(title, lang) {
    try {
        // Encode the title and construct the search URL
        const slug = encodeURIComponent(title);
        const url = `/movie/results/?lang=${lang}&query=${slug}`;
        const CacheID = slug + "_" + lang;
        console.log('Searching for movie:', title, 'URL:', url);
        
        // Check if the result is already cached
        let res = cache.get(CacheID);
        if (!res) {
            // If not cached, perform the search
            res = await getcatalogresults(url);
            cache.set(CacheID, res); // Cache the results
        }

        // Function to normalize titles for comparison
        const normalizeTitle = (str) => str.toLowerCase().replace(/[\s\W_]+/g, '');

        // Normalize input title
        const normalizedTitle = normalizeTitle(title);

        // Find the Einthusan ID in the search results
        const result = res.find(movie => normalizeTitle(movie.name) === normalizedTitle);

        // If found, return the EinthusanID
        if (result) {
            return result.EinthusanID;
        } else {
            console.error("EinthusanID not found for title:", title);
            return null;
        }

    } catch (e) {
        console.error("Error in getEinthusanIdByTitle:", e);
        return Promise.reject(e);
    }
}



async function ttnumberToTitle(ttNumber) {
    try {
        // Fetch movie metadata from IMDb API using the provided ttNumber
        const res = await fetch(`https://v2.sg.media-imdb.com/suggestion/t/${ttNumber}.json`);
        const json = await res.json();

        // Find the movie entry from the returned data
        const movie = json.d.find((item) => item.id === ttNumber);

        // If the movie is found, return the title
        if (movie) {
            return movie.l;  // Movie title
        } else {
            console.error("Movie not found for IMDb ID:", ttNumber);
            return null;
        }
    } catch (e) {
        console.error("Error fetching title for IMDb ID:", ttNumber, e);
        return null;
    }
}


async function getAllRecentMovies(maxPages = 5) {
    const baseUrl = "https://einthusan.tv/movie/results/?find=Recent&lang=hindi&page=";
    const resultsArray = [];

    try {
        for (let page = 1; page <= maxPages; page++) {
            const url = baseUrl + page;
            const cachedResults = CatalogCache.get(url);
            if (cachedResults) {
                resultsArray.push(...cachedResults);
                continue; // Skip fetching if cached
            }

            const res = await client.get(url);
            if (!res || !res.data) {
                console.error(`Failed to get catalog results for page ${page}: No data received`);
                continue; // Continue to the next page instead of breaking
            }

            const html = parse(res.data);
            const movieList = html.querySelector("#UIMovieSummary");
            if (!movieList) continue; // Continue if no movie list found

            const searchResults = movieList.querySelectorAll("li");
            if (searchResults.length === 0) continue; // Continue if no more results

            for (const item of searchResults) {
                const img = item.querySelector("div.block1 a img").rawAttributes['src'];
                const year = item.querySelector("div.info p").childNodes[0].rawText;
                const title = item.querySelector("a.title h3").rawText;
                const id = item.querySelector("a.title").rawAttributes['href'];

                // Check for duplicates before adding to results
                const EinthusanId = "einthusan_id:" + id.split('/')[3];
                if (!resultsArray.some(movie => movie.id === EinthusanId)) {
                    // Fetch IMDb ID for each title
                    const IMDbid = await getImdbId(title); // Assuming getImdbId is defined elsewhere

                    resultsArray.push({
                        id: IMDbid, // Include the IMDb ID
                        EinthusanID: EinthusanId.split(':')[1], // Extract Einthusan ID
                        type: "movie",
                        name: title,
                        poster: "https:" + img,
                        releaseInfo: year,
                        posterShape: 'poster',
                    });
                }
            }

            // Cache the results for the current page only if there are valid results
            if (searchResults.length) CatalogCache.set(url, resultsArray);
        }

        console.log('Recent Hindi Movies:', resultsArray);
        return resultsArray;

    } catch (e) {
        console.error('An error occurred:', e);
        return []; // Return an empty array on error
    }
}


//getAllRecentMovies(3).then(movies => {
 //  console.log("Fetched Movies:", movies);
//}).catch(error => {
  //  console.error("Error fetching movies:", error);
//});

module.exports = {
    search,
    meta,
    stream,
    getAllRecentMovies
};
