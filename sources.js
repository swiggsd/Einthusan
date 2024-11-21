const { parse } = require("node-html-parser");
const config = require('./config');
require('dotenv').config();
const cheerio = require('cheerio');
const axios = require('axios').default;
const nameToImdb = require("name-to-imdb");
const NodeCache = require("node-cache");
const cacheTTL = 30 * 60; // Cache TTL set to 30 minutes
const cache = new NodeCache({ stdTTL: cacheTTL, checkperiod: 60 * 60 });
const client = axios.create({
    baseURL: config.BaseURL,
    timeout: 40000,
});

// Utility function to normalize titles for comparison
const normalizeTitle = (str) => str.toLowerCase().replace(/[\s\W_]+/g, '');

// Function to fetch IMDb ID
async function getImdbId(title) {
    return new Promise((resolve) => {
        nameToImdb(title, (err, res) => {
            if (err) {
                console.error(`Error fetching IMDb ID for title "${title}":`, err);
                return resolve(null);
            }
            resolve(res);
        });
    });
}

// Function to fetch title from IMDb number
async function ttnumberToTitle(ttNumber) {
    try {
        const res = await axios.get(`https://v2.sg.media-imdb.com/suggestion/t/${ttNumber}.json`);
        const movie = res.data.d.find(item => item.id === ttNumber);
        return movie ? movie.l : null;
    } catch (e) {
        console.error("Error fetching title for IMDb ID:", ttNumber, e);
        return null;
    }
}

// Function to replace IP in the link
const replaceIpInLink = (link) => {
    const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
    const ipMatch = link.match(ipRegex);
    return ipMatch ? link.replace(ipMatch[0], 'cdn1.einthusan.io') : link;
};

// Stream function to get video streams
async function stream(einthusan_id, lang) {
    try {
        if (einthusan_id.startsWith("tt")) {
            const title = await ttnumberToTitle(einthusan_id);
            if (!title) throw new Error(`Unable to retrieve title for ttNumber: ${einthusan_id}`);
            einthusan_id = await getEinthusanIdByTitle(title, lang);
        }

        const url = `${config.BaseURL}/movie/watch/${einthusan_id}/`;
        const res = await client.get(url);
        if (res.status !== 200) throw new Error(`Failed to fetch the page. Status code: ${res.status}`);

        const $ = cheerio.load(res.data);
        const videoSection = $('#UIVideoPlayer');
        const videoDetails = $(`#UIMovieSummary`);
        if (!videoSection.length) throw new Error("Video player section not found in the HTML.");

        const title = videoSection.attr("data-content-title");
        const year = videoDetails.find("div.info p").contents().get(0).data.trim();
        let mp4Link = replaceIpInLink(videoSection.attr('data-mp4-link'));
        console.log(`Fetched Stream Link:`, mp4Link);
        if (!mp4Link) throw new Error("No video source found");

        return { streams: [{ url: mp4Link, name: 'EinthusanTV', title: `${title} (${year})` }] };
    } catch (e) {
        console.error("Error in stream function:", e);
        throw e; // Re-throw the error for upstream handling
    }
}



// Search function to find movies
async function search(lang, slug) {
    try {
        const cacheID = `${slug}_${lang}`;
        slug = encodeURIComponent(slug);
        const url = `/movie/results/?lang=${lang}&query=${slug}`;
        console.log('search url:', url);
        let res = cache.get(cacheID);
        if (!res) {
            res = await getcatalogresults(url);
            cache.set(cacheID, res);
        }
        return res;
    } catch (e) {
        console.error("Error in search function:", e);
        throw e; // Re-throw the error for upstream handling
    }
}

// Function to get catalog results
async function getcatalogresults(url) {
    try {
        const cachedResults = cache.get(url);
        if (cachedResults) return cachedResults;

        const res = await client.get(url);
        if (!res || !res.data) throw new Error("Error in getcatalogresults: Failed to retrieve catalog results");

        const html = parse(res.data);
        const searchResults = html.querySelector("#UIMovieSummary")?.querySelectorAll("li") || [];
        const resultsArray = [];

        for (const item of searchResults) {
            // Check for the existence of each element before accessing its properties
            const imgElement = item.querySelector("div.block1 a img");
            const infoElement = item.querySelector("div.info p");
            const titleElement = item.querySelector("a.title h3");
            const idElement = item.querySelector("a.title");

            const img = imgElement ? imgElement.rawAttributes?.src : null;
            const year = infoElement && infoElement.childNodes[0] ? infoElement.childNodes[0].rawText.trim() : null;
            const title = titleElement ? titleElement.rawText.trim() : null;
            const einthusanId = idElement ? idElement.rawAttributes?.href.split('/')[3] : null;

            if (img && year && title && einthusanId) {
                const imdbId = await getImdbId(title);
                resultsArray.push({
                    id: imdbId,
                    EinthusanID: einthusanId,
                    type: "movie",
                    name: title,
                    poster: img.startsWith('http') ? img : `https:${img}`,
                    releaseInfo: year,
                    posterShape: 'poster',
                });
            }
        }

        if (resultsArray.length) cache.set(url, resultsArray);
        return resultsArray;
    } catch (e) {
        console.error("Error in getcatalogresults:", e);
        throw e; // Re-throw the error for upstream handling
    }
}

// Function to get Einthusan ID by title
async function getEinthusanIdByTitle(title, lang) {
    try {
        const slug = encodeURIComponent(title);
        const url = `/movie/results/?lang=${lang}&query=${slug}`;
        const cacheID = `${slug}_${lang}`;
       

        // Check if the result is already cached
        let res = cache.get(cacheID);
        if (!res) {
            // If not cached, perform the search
             console.log('Searching for movie:', title, 'URL:', url);
            res = await getcatalogresults(url);
            cache.set(cacheID, res); // Cache the results
        } else {
            console.log(`Returning cached results for: ${title}`);
        }

        const normalizedTitle = normalizeTitle(title);
        const result = res.find(movie => normalizeTitle(movie.name) === normalizedTitle);
        if (result) return result.EinthusanID;

        console.error("EinthusanID not found for title:", title);
        return null;
    } catch (e) {
        console.error("Error in getEinthusanIdByTitle:", e);
        throw e; // Re-throw the error for upstream handling
    }
}

async function getAllRecentMovies(maxPages, lang) {
    const baseUrl = config.BaseURL;
    const fetchUrl = `/movie/results/?find=Recent&lang=${lang}&page=`;
    const resultsArray = [];

    const fetchPage = async (page) => {
        const url = `${baseUrl}${fetchUrl}${page}`;
        const cachedResults = cache.get(url);
        if (cachedResults) {
            // Return cached results directly if they exist
            return cachedResults;
        }

        try {
            const res = await client.get(url);
            if (!res || !res.data) return [];

            const html = parse(res.data);
            const searchResults = html.querySelector("#UIMovieSummary")?.querySelectorAll("li") || [];
            const pageMovies = await Promise.all(searchResults.map(async (item) => {
                const imgElement = item.querySelector("div.block1 a img");
                const infoElement = item.querySelector("div.info p");
                const titleElement = item.querySelector("a.title h3");
                const idElement = item.querySelector("a.title");

                const img = imgElement?.rawAttributes?.src;
                const year = infoElement?.childNodes[0]?.rawText;
                const title = titleElement?.rawText;
                const id = idElement?.rawAttributes?.href;

                if (img && year && title && id) {
                    const einthusanId = id.split('/')[3];
                    const imdbId = await getImdbId(title);
                    return {
                        id: imdbId,
                        EinthusanID: einthusanId,
                        type: "movie",
                        name: title,
                        poster: `https:${img}`,
                        releaseInfo: year,
                        posterShape: 'poster',
                    };
                }
                return null;
            }));

            // Cache the results for this page with a TTL of 12 hours
            const filteredMovies = pageMovies.filter(Boolean);
            cache.set(url, filteredMovies, 43200); // 43200 seconds = 12 hours
            return filteredMovies;
        } catch (e) {
            console.error(`Error fetching page ${page}:`, e);
            return [];
        }
    };

    const fetchPromises = Array.from({ length: maxPages }, (_, i) => fetchPage(i + 1));
    const allResults = (await Promise.all(fetchPromises)).flat().filter(Boolean);

    allResults.forEach((movie) => {
        if (!resultsArray.some((m) => m.EinthusanID === movie.EinthusanID)) {
            resultsArray.push(movie);
        }
    });

    // Cache the final results array with a TTL of 12 hours
    const cacheKey = `recent_movies_${lang}`;
    cache.set(cacheKey, resultsArray, 43200); // 43200 seconds = 12 hours
    console.log(`Cached all results for ${lang}:`, resultsArray);

    return resultsArray;
}


module.exports = {
    search,
    stream,
    getAllRecentMovies
};