const { parse } = require("node-html-parser");
const config = require('./config');
require('dotenv').config();
const cheerio = require('cheerio');
const axios = require('axios');
const nameToImdb = require("name-to-imdb");
const NodeCache = require("node-cache");
const { promisify } = require('util');

// Enhanced caching configuration
const cache = new NodeCache({
    stdTTL: 30 * 60, // 30 minutes default TTL
    checkperiod: 60 * 60,
    useClones: false, // Disable cloning for better performance
    maxKeys: 1000 // Limit cache size
});

// Create axios instance with optimized settings
const client = axios.create({
    baseURL: config.BaseURL,
    timeout: 40000,
    headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    },
    // Enable HTTP keep-alive
    httpAgent: new (require('http').Agent)({ keepAlive: true }),
    httpsAgent: new (require('https').Agent)({ keepAlive: true }),
    // Implement retry logic
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000
});

// Add retry interceptor
client.interceptors.response.use(undefined, async (err) => {
    const config = err.config;
    if (!config || !config.retries) return Promise.reject(err);

    config.retryCount = config.retryCount ?? 0;
    if (config.retryCount >= config.retries) {
        console.error(`Request failed after ${config.retries} retries:`, err);
        return Promise.reject(err);
    }

    config.retryCount += 1;
    const delay = config.retryDelay(config.retryCount);
    console.log(`Retrying request... Attempt ${config.retryCount} after ${delay} ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return client(config);
});

// Promisify nameToImdb for better async handling
const getImdbIdAsync = promisify(nameToImdb);

// Optimized title normalization
const normalizeTitle = (str) => str.toLowerCase().replace(/[\s\W_]+/g, '');

// Implement request queue to prevent rate limiting
class RequestQueue {
    constructor(concurrency = 10) {
        this.queue = [];
        this.running = 0;
        this.concurrency = concurrency;
    }

    async add(fn) {
        if (this.running >= this.concurrency) {
            console.log('Request queue is full. Waiting for available slot...');
            await new Promise(resolve => this.queue.push(resolve));
        }
        this.running++;
        try {
            return await fn();
        } finally {
            this.running--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                next();
            }
        }
    }
}

const requestQueue = new RequestQueue();

// Optimized IMDb ID fetching
async function getImdbId(title) {
    const cacheKey = `imdb_${normalizeTitle(title)}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for IMDb ID: ${title}`);
        return cached;
    }

    try {
        console.log(`Fetching IMDb ID for title: "${title}"`);
        const result = await requestQueue.add(() => getImdbIdAsync(title));
        if (result) {
            console.log(`Fetched IMDb ID: ${result} for title: "${title}"`);
            cache.set(cacheKey, result);
        }
        return result;
    } catch (err) {
        console.error(`Error fetching IMDb ID for "${title}":`, err);
        return null;
    }
}

// Optimized title fetching from IMDb
async function ttnumberToTitle(ttNumber) {
    const cacheKey = `title_${ttNumber}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for title of ttNumber: ${ttNumber}`);
        return cached;
    }

    try {
        console.log(`Fetching title for IMDb ID: ${ttNumber}`);
        const response = await requestQueue.add(() => 
            axios.get(`https://v2.sg.media-imdb.com/suggestion/t/${ttNumber}.json`, {
                timeout: 5000
            })
        );
        const movie = response.data.d.find(item => item.id === ttNumber);
        const title = movie ? movie.l : null;
        if (title) {
            console.log(`Fetched title: "${title}" for IMDb ID: ${ttNumber}`);
            cache.set(cacheKey, title);
        }
        return title;
    } catch (err) {
        console.error("Error fetching title for IMDb ID:", ttNumber, err);
        return null;
    }
}

// Optimized IP replacement
const replaceIpInLink = (link) => {
    console.log(`Replacing IP in link: ${link}`);
    return link.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'cdn1.einthusan.io');
};

// Optimized stream function
async function stream(einthusan_id, lang) {
    const cacheKey = `stream_${einthusan_id}_${lang}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for stream: ${einthusan_id}`);
        return cached;
    }

    try {
        if (einthusan_id.startsWith("tt")) {
            console.log(`Fetching Einthusan ID by title for: ${einthusan_id}`);
            const title = await ttnumberToTitle(einthusan_id);
            if (!title) throw new Error(`Unable to retrieve title for ttNumber: ${einthusan_id}`);
            einthusan_id = await getEinthusanIdByTitle(title, lang);
        }

        const url = `${config.BaseURL}/movie/watch/${einthusan_id}/`;
        console.log(`Fetching stream from URL: ${url}`);
        const response = await requestQueue.add(() => client.get(url));
        const $ = cheerio.load(response.data);
        
        const videoSection = $('#UIVideoPlayer');
        if (!videoSection.length) throw new Error("Video player section not found");

        const title = videoSection.attr("data-content-title");
        const year = $('#UIMovieSummary div.info p').contents().first().text().trim();
        const mp4Link = replaceIpInLink(videoSection.attr('data-mp4-link'));
        
        if (!mp4Link) throw new Error("No video source found");

        const result = {
            streams: [{
                url: mp4Link,
                name: 'EinthusanTV',
                title: `${title} (${year})`
            }]
        };

        console.log(`Stream fetched successfully for: ${title} (${year})`);
        cache.set(cacheKey, result, 3600); // Cache for 1 hour
        return result;
    } catch (err) {
        console.error("Error in stream function:", err);
        throw err;
    }
}

// Optimized search function with batch processing
async function search(lang, slug) {
    const cacheKey = `search_${slug}_${lang}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for search results: ${slug}`);
        return cached;
    }

    try {
        console.log(`Searching for: ${slug} in language: ${lang}`);
        const url = `/movie/results/?lang=${lang}&query=${encodeURIComponent(slug)}`;
        const results = await getcatalogresults(url);
        cache.set(cacheKey, results);
        return results;
    } catch (err) {
        console.error("Error in search function:", err);
        throw err;
    }
}

// Optimized catalog results fetching
async function getcatalogresults(url) {
    const cached = cache.get(url);
    if (cached) {
        console.log(`Cache hit for catalog results: ${url}`);
        return cached;
    }

    try {
        console.log(`Fetching catalog results from URL: ${url}`);
        const response = await requestQueue.add(() => client.get(url));
        const html = parse(response.data);
        const searchResults = html.querySelector("#UIMovieSummary")?.querySelectorAll("li") || [];

        // Process results in batches for better performance
        const batchSize = 5;
        const resultsArray = [];
        
        for (let i = 0; i < searchResults.length; i += batchSize) {
            const batch = searchResults.slice(i, i + batchSize);
            const batchPromises = batch.map(async (item) => {
                const imgElement = item.querySelector("div.block1 a img");
                const infoElement = item.querySelector("div.info p");
                const titleElement = item.querySelector("a.title h3");
                const idElement = item.querySelector("a.title");

                if (!imgElement || !infoElement || !titleElement || !idElement) return null;

                const img = imgElement.rawAttributes?.src;
                const year = infoElement.childNodes[0]?.rawText.trim();
                const title = titleElement.rawText.trim();
                const einthusanId = idElement.rawAttributes?.href.split('/')[3];

                if (!img || !year || !title || !einthusanId) return null;

                const imdbId = await getImdbId(title);
                return {
                    id: imdbId,
                    EinthusanID: einthusanId,
                    type: "movie",
                    name: title,
                    poster: img.startsWith('http') ? img : `https:${img}`,
                    releaseInfo: year,
                    posterShape: 'poster'
                };
            });

            const batchResults = await Promise.all(batchPromises);
            resultsArray.push(...batchResults.filter(Boolean));
        }

        if (resultsArray.length) {
            console.log(`Fetched ${resultsArray.length} catalog results from URL: ${url}`);
            cache.set(url, resultsArray);
        }
        return resultsArray;
    } catch (err) {
        console.error("Error in getcatalogresults:", err);
        throw err;
    }
}

// Optimized function to get Einthusan ID by title
async function getEinthusanIdByTitle(title, lang) {
    const cacheKey = `einthusan_${normalizeTitle(title)}_${lang}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for Einthusan ID by title: ${title}`);
        return cached;
    }

    try {
        console.log(`Fetching Einthusan ID for title: ${title}`);
        const url = `/movie/results/?lang=${lang}&query=${encodeURIComponent(title)}`;
        const results = await getcatalogresults(url);
        
        const normalizedSearchTitle = normalizeTitle(title);
        const match = results.find(movie => normalizeTitle(movie.name) === normalizedSearchTitle);
        
        if (match) {
            console.log(`Found Einthusan ID: ${match.EinthusanID} for title: ${title}`);
            cache.set(cacheKey, match.EinthusanID);
            return match.EinthusanID;
        }
        
        throw new Error(`No match found for title: ${title}`);
    } catch (err) {
        console.error("Error in getEinthusanIdByTitle:", err);
        throw err;
    }
}

// Optimized function to get all recent movies with parallel processing
async function getAllRecentMovies(maxPages, lang) {
    const cacheKey = `recent_movies_${lang}_${maxPages}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`Cache hit for recent movies: ${lang}, max pages: ${maxPages}`);
        return cached;
    }

    try {
        console.log(`Fetching all recent movies for language: ${lang}, max pages: ${maxPages}`);
        const fetchPage = async (page) => {
            const pageUrl = `/movie/results/?find=Recent&lang=${lang}&page=${page}`;
            const pageKey = `recent_page_${lang}_${page}`;
            
            const cachedPage = cache.get(pageKey);
            if (cachedPage) {
                console.log(`Cache hit for recent movies page: ${page}`);
                return cachedPage;
            }

            try {
                const response = await requestQueue.add(() => client.get(pageUrl));
                const html = parse(response.data);
                const searchResults = html.querySelector("#UIMovieSummary")?.querySelectorAll("li") || [];
                
                const movies = await Promise.all(
                    searchResults.map(async (item) => {
                        const imgElement = item.querySelector("div.block1 a img");
                        const infoElement = item.querySelector("div.info p");
                        const titleElement = item.querySelector("a.title h3");
                        const idElement = item.querySelector("a.title");

                        if (!imgElement || !infoElement || !titleElement || !idElement) return null;

                        const img = imgElement.rawAttributes?.src;
                        const year = infoElement.childNodes[0]?.rawText.trim();
                        const title = titleElement.rawText.trim();
                        const einthusanId = idElement.rawAttributes?.href.split('/')[3];

                        if (!img || !year || !title || !einthusanId) return null;

                        const imdbId = await getImdbId(title);
                        return {
                            id: imdbId,
                            EinthusanID: einthusanId,
                            type: "movie",
                            name: title,
                            poster: img.startsWith('http') ? img : `https:${img}`,
                            releaseInfo: year,
                            posterShape: 'poster'
                        };
                    })
                );

                const validMovies = movies.filter(Boolean);
                cache.set(pageKey, validMovies, 43200); // Cache page results for 12 hours
                console.log(`Fetched ${validMovies.length} movies from page: ${page}`);
                return validMovies;
            } catch (err) {
                console.error(`Error fetching page ${page}:`, err);
                return [];
            }
        };

        // Fetch all pages in parallel with controlled concurrency
        const pagePromises = [];
        for (let i = 1; i <= maxPages; i++) {
            pagePromises.push(fetchPage(i));
        }

        const allPages = await Promise.all(pagePromises);
        const uniqueMovies = new Map();

        // Merge results and remove duplicates
        allPages.flat().forEach(movie => {
            if (movie && !uniqueMovies.has(movie.EinthusanID)) {
                uniqueMovies.set(movie.EinthusanID, movie);
            }
        });

        const results = Array.from(uniqueMovies.values());
        console.log(`Fetched a total of ${results.length} unique recent movies.`);
        cache.set(cacheKey, results, 43200); // Cache final results for 12 hours
        return results;
    } catch (err) {
        console.error("Error in getAllRecentMovies:", err);
        throw err;
    }
}

// Error handler for uncaught promises
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});

module.exports = {
    search,
    stream,
    getAllRecentMovies
};