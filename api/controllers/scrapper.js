const puppeteer = require('puppeteer');
const fs = require('fs');
const csv = require('fast-csv');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');
const moment = require('moment');

// const config = require('../config');
const API = require('../helpers/axiosApi');
// const { ErrorHandler } = require('../helpers/errorhandler');

dotenv.config();

const chunkSize = 50;
let processed = 0;

/** 
 * Read CSV file
 */
const read_file = async () =>{
	const args = process.argv.slice(2);
	let fileName = "companylist.csv";
	switch (args[0]) {
		case 'batch_1' : fileName = "batch_1.csv"; break;
		case 'batch_2' : fileName = "batch_2.csv"; break;
		case 'batch_3' : fileName = "batch_3.csv"; break;
		case 'batch_4' : fileName = "batch_4.csv"; break;
		default: fileName = "companylist.csv"; break;
	}
	console.log('fileName: ', fileName);

	return new Promise( async (resolve, reject) => {
		let fileRows = [];
		fs.createReadStream(path.resolve(__dirname, 'assets', fileName))
		.pipe(csv.parse({ headers: true }))
		.on('error', error => reject(error))
		.on('data', row => fileRows.push(row))
		.on('end', (rowCount) => {
			console.log(`Parsed ${rowCount} rows`);
			resolve(fileRows);
		});
	});
};

const formatDate = () => {
	const d = new Date();
	let month = '' + (d.getMonth() + 1),
		day = '' + d.getDate(),
		year = d.getFullYear();

	if (month.length < 2) { month = '0' + month; }
	if (day.length < 2) { day = '0' + day; }

	return [year, month, day].join('-');
}


/**
 * Append scrapped data in output file
 * 
 * @param {Object} rows 
 */
const append = async (row) => {
	try {
		const rowData = {
			userId: row.userId,
			batchId: row.batchId,
			stockId: row.stockId,
			stockSymbol: row.stockSymbol ? row.stockSymbol.trim() : '',
			stockName: row.stockName ? row.stockName.trim() : '-',
			fairValue: (row.fairValue !== null && row.fairValue !== undefined && parseFloat(row.fairValue)) ? parseFloat(row.fairValue) : 0,
			currentPrice: (row.currentPrice !== null && row.currentPrice !== undefined) ? row.currentPrice : 0,
			investmentName: row.investmentName ? row.investmentName.trim() : '-',
			starRating: row.starRating ? row.starRating : '-',
			analystRating: row.analystRating ? row.analystRating : '-',
			date: formatDate(),
			comment: row.comment ? row.comment : '',
		};
		processed++;
		// console.log(rowData);
		const query = `INSERT INTO records (		
			user_id,
			batch_id,
			stock_id,
			stock_symbol,
			stock_name,
			fair_value,
			current_value,
			investment_name,
			star_rating,
			analyst_rating,
			comment
		) VALUES (
			'` + rowData.userId + `',
			'` + rowData.batchId + `',
			'` + rowData.stockId + `',
			'` + rowData.stockSymbol + `',
			'` + rowData.stockName + `',
			'` + rowData.fairValue + `',
			'` + rowData.currentPrice + `',
			'` + rowData.investmentName + `',
			'` + rowData.starRating + `',
			'` + rowData.analystRating + `',
			'` + rowData.comment + `'
		)`;
		// console.log(query);
		const client = new Client();
		await client.connect();
		const result = await client.query(query);
		await client.end();
		return result;
		// const csvFile = fs.createWriteStream("assets/output.csv", { flags: 'a' });
		// csvFile.write('\n');
		// csv.writeToStream(csvFile, [rowData], { headers: false });
	} catch (error) {
		console.log("ERROR while inserting record : ",error);
		return false;
	}
};

/**
 * Inialize browser and login into morningstar website
 */
const initialize = async () => {
	try {
		var browser = await puppeteer.launch({ headless: true });
		const page = await browser.newPage();
		await page.setDefaultTimeout(60 * 1000);
		await page.setDefaultNavigationTimeout(300 *  1000);		// Configure the navigation timeout to 5 mins
		await page.waitFor(4000); // Wait for 4 seconds

		await page.goto(process.env.LOGIN_URL);
		await page.type('[name="user"]', process.env.USERNAME);
		await page.type('[name="pass"]', process.env.PASSWORD);
		
		const form = await page.$('#access-databases');
		await form.evaluate(form => form.submit());
		console.log("LOGIN");
		await page.waitForNavigation();
		await page.waitForSelector('a[href^="/Selectors/Fund/Selector.html"]');
		await page.goto(process.env.FUNDS_URL);
		// await page.waitForNavigation();
		console.log("REDIRECTED TO FUNDS PAGE");
		// await page.waitForNavigation();
		return { browser, page };
	} catch (error) {
		console.log(error);
		await browser.close();
	}
};

/**
 * Remove characters that cause line or cell change in CSV
 * 
 * @param {String} value
 * @returns {String} value
 */
const remove_invalid_characters = (value) => {
	if (!value) { return value; }
	value = value.replace(/\r?\n|\r/g, '');
	value = value.replace(/(\r\n|\n|\r)/gm, "");
	value = value.replace(/[;,]/g, '');
	value = value.replace(/,/g, '');
	value = value.replace(/;/g, '');
	value = value.replace(/'/g, `"`);
	return value;
};

/**
 * Fetch user from db
 * 
 * @param {String} username 
 * @returns {Number} id
 */
const fetchUser = async (username) => {
	try {
		const client = new Client();
		await client.connect();
		const query = `SELECT * FROM users WHERE user_name = '` + username + `'`;
		const result = await client.query(query);
		await client.end();
		// console.log("==> ", result.rows[0]);
		return (result && result.rows && result.rows.length) ? result.rows[0].id : 0;
	} catch (error) {
		console.log("ERROR in fetchUser : ", error)	;
		return 0;
	}	
};

/**
 * Create records table
 */
const recordSchema = async () => {
	try {
		const client = new Client();
		await client.connect();
		const result = await client.query(`CREATE TABLE records (
			id SERIAL PRIMARY KEY,
			user_id INT NOT NULL,
			batch_id INT NOT NULL,
			stock_id INT NOT NULL,
			stock_symbol CHAR(20) NOT NULL,
			stock_name VARCHAR,
			fair_value float8,
			current_value float8,
			investment_name VARCHAR,
			star_rating VARCHAR,
			analyst_rating VARCHAR,
			comment TEXT,
			created_at TIMESTAMP default current_timestamp
		)`);
		console.log('Records created successfully : ', result);
		await client.end();
		return result;
	} catch (error) {
		console.log("ERROR in fetchUser : ", error)	;
		return 0;
	}	
};

/**
 * Create script_log table
 */
const scriptLogSchema = async () => {
	try {
		const client = new Client();
		await client.connect();
		// CREATE TYPE status_enum AS ENUM ('not_completed','completed', 'errored');
		const result = await client.query(`
		CREATE TABLE script_batch (
			id SERIAL PRIMARY KEY,
			status status_enum NOT NULL default 'not_completed',
			message TEXT,
			completed_at TIMESTAMP,
			created_at TIMESTAMP default current_timestamp
		)`);
		console.log('Records created successfully : ', result);
		await client.end();
		return result;
	} catch (error) {
		console.log("ERROR in fetchUser : ", error)	;
		return 0;
	}	
};

/**
 * Fetch stocks from db
 * 
 * @returns {Array} id
 */
const fetchStocks = async () => {
	try {
		const client = new Client();
		await client.connect();
		// const query = `SELECT * FROM stocks`;
		const query = `SELECT * FROM stocks WHERE id > 553`;
		const result = await client.query(query);
		await client.end();
		// console.log("==> ", result.rows);
		return result && result.rows ? result.rows : false;
	} catch (error) {
		console.log("ERROR in fetchUser : ", error)	;
		return 0;
	}
};

const checkNextIteration = async (index, stocksLength, browser, batchId) => {
	try {
		// console.log(index + " === " + stocksLength);
		if (index === stocksLength - 1) {
			console.log("--- COMPLETED ---");
			await setBatchStatus(batchId, 'completed');
			await browser.close();
		}
	} catch (error) {
		
	}
};

/**
 * Check if script is already running
 * 
 * @returns {Array} rows
 */
const checkIfScrappingRunning = async () => {
	try {
		const client = new Client();
		await client.connect();
		const query = `SELECT * FROM script_batch
						WHERE status = 'not_completed'
						ORDER BY created_at DESC
						LIMIT 1`;
		const result = await client.query(query);
		await client.end();
		// console.log("==> ", result.rows);
		return result && result.rows ? result.rows : false;
	} catch (error) {
		console.log("ERROR in fetchUser : ", error)	;
		return 0;
	}
};

const logScriptBatch = async () => {
	try {
		const query = `INSERT INTO script_batch (status) VALUES ('not_completed') RETURNING id`;
		// console.log(query);
		const client = new Client();
		await client.connect();
		const result = await client.query(query);
		await client.end();
		return (result && result.rows && result.rows.length) ? result.rows[0].id : 0;
	} catch (error) {
		console.log("ERROR while inserting script_batch : ",error);
		return false;
	}
};

/**
 * Set batch status
 * 
 * @param {Number} batchId 
 * @param {String} status 
 */
const setBatchStatus = async (batchId, status, message) => {
	try {
		message = message || '';
		const query = `UPDATE script_batch
						SET status = '` + status + `', message = '` + message +`', completed_at = '` + moment().format('YYYY-MM-DD HH:mm:ss') +`' 
						WHERE id = ` + batchId;
		// console.log(query);
		const client = new Client();
		await client.connect();
		const result = await client.query(query);
		await client.end();
		return result;
	} catch (error) {
		console.log("ERROR while inserting script_batch : ",error);
		return false;
	}
};

const scrapItems = async (req, res, next) => {
	try {
		// recordSchema();
		// return scriptLogSchema();
		// const fileData = await read_file();
		// const ifRunning = await checkIfScrappingRunning();
		// if (ifRunning && ifRunning.length) { return res.json({ success: true, message: 'Script already running', ifRunning }); }

		// var batchId = await logScriptBatch();
		var batchId = 1;
		// await setBatchStatus(batchId, 'completed');
		// return res.json({ success: false, message: 'Test!!', batchId });

		if (!batchId) { return res.json({ success: false, message: 'Error in initiating script' }); }
		const stocks = await fetchStocks();
		if (!stocks || !stocks.length) {
			await setBatchStatus(batchId, 'errored', 'No stocks found.');
			return res.json({ success: true, message: 'NO STOCKS FOUND. PLEASE FETCH THE STOCKS FROM POLYGON FIRST.' });
		}
		// console.log(stocks); return res.json({ success: true, message: 'TEST' });;
		const userId = await fetchUser(process.env.USERNAME);
		if (!userId) {
			await setBatchStatus(batchId, 'errored', 'User not found.');
			return res.json({ success: true, message: 'USER NOT FOUND' });
		}

		if (stocks.length) {
			res.json({ success: true, message: 'Scrapping have started in backgroud! Please wait.' });
			for (let i = 0; i < Object.keys(stocks).length; i++) {
				const row = stocks[i];
				// const row = fileData[1];
				console.log("processed : ", processed);
				if (processed === 0) {
					var { browser, page } = await initialize();
				}
				await page.waitForSelector('input#AutoCompleteBox');

				// await page.waitForNavigation();
				await page.evaluate(() => document.querySelector('input#AutoCompleteBox').click()); 

				await page.evaluate(() => {
					document.querySelector('input#AutoCompleteBox').value = ''
				});
				await page.type('input#AutoCompleteBox', row.ticker);
				await page.waitFor(4000);

				const stocksData = await API.get('v1/last/stocks/' + row.ticker + '?apiKey=' + process.env.KEY);
				// console.log(stocksData.data);
				const currentPrice = (stocksData.data && stocksData.data.last && stocksData.data.last.price) ? stocksData.data.last.price : 0;

				let dropDownElement = await page.$('table.ACDropDownStyle');
				if (!dropDownElement) {
					console.log(row.ticker , " - dropDownElement TRY 1 : ", dropDownElement);
					await page.waitFor(6000);
					dropDownElement = await page.$('table.ACDropDownStyle');
					if (!dropDownElement) {
						console.log(row.ticker , " - dropDownElement TRY 2 : ", dropDownElement);
						let rowData = {
							userId,
							batchId,
							stockId: row.id,
							stockSymbol: row.ticker,
							stockName: '-',
							fairValue: 0,
							currentPrice,
							comment: 'No result in autocomplete search'
						};
						await append(rowData);
						await page.waitFor(1000);
						if (processed >= chunkSize) { 
							processed = 0;
							console.log("Browser Closed");
							await browser.close();
							await page.waitFor(2000);
						}
						checkNextIteration(i, stocks.length, browser, batchId);
						// data.push(rowData);
						continue;
					}
				}
				// await page.waitForSelector('table.ACDropDownStyle');

				await page.keyboard.press("Enter");
				await page.waitForNavigation();
				await page.waitFor(5000);

				let nameElement = await page.$('span.security-info-name'), normalFormat = true;
				if (!nameElement) {
					console.log(row.ticker , " - nameElement TRY 1 : ", nameElement);
					await page.waitFor(4000);
					nameElement = await page.$('span.security-info-name');
					if (!nameElement) {
						console.log(row.ticker , " - nameElement TRY 2 : ", nameElement);
						normalFormat = false;
					}
				}

				if (!normalFormat) {
					let investmentNameElement = await page.$('span.sal-mip-quote__investment-name'), normalFormat = true;
					if (!investmentNameElement) {
						console.log(row.ticker , " - investmentNameElement TRY 1 : ", investmentNameElement);
						await page.waitFor(4000);
						investmentNameElement = await page.$('span.sal-mip-quote__investment-name');
						if (!investmentNameElement) {
							console.log(row.ticker , " - investmentNameElement TRY 2 : ", investmentNameElement);
							let rowData = {
								userId,
								batchId,
								stockId: row.id,
								stockSymbol: row.ticker,
								stockName: '-',
								fairValue: 0,
								currentPrice,
								comment: 'Investment Name field not found'
							};
							// data.push(rowData);
							await append(rowData);
							await page.waitFor(1000);
							if (processed >= chunkSize) { 
								processed = 0;
								console.log("Browser Closed");
								await browser.close();
								await page.waitFor(2000);
							}
							checkNextIteration(i, stocks.length, browser, batchId);
							continue;
						}
					}

					const investmentNameHandle = await page.$('span.sal-mip-quote__investment-name');
					let investmentName = await page.evaluate(span => span.innerHTML, investmentNameHandle);
					investmentName  = remove_invalid_characters(investmentName);

					// await page.waitFor(1000);
					let stockElement = await page.$('span.sal-mip-quote__symbol');
					if (!stockElement) {
						console.log(row.ticker , " - stockElement TRY 1 : ", stockElement);
						await page.waitFor(4000);
						stockElement = await page.$('span.sal-mip-quote__symbol');
						if (!stockElement) {
							console.log(row.ticker , " - stockElement TRY 2 : ", stockElement);
							let rowData = {
								userId,
								batchId,
								stockId: row.id,
								stockSymbol: row.ticker,
								investmentName,
								fairValue: 0,
								currentPrice,
								comment: 'Stock symbol not available'
							};
							// data.push(rowData);
							await append(rowData);
							await page.waitFor(1000);
							if (processed >= chunkSize) { 
								processed = 0;
								console.log("Browser Closed");
								await browser.close();
								await page.waitFor(2000);
							}
							checkNextIteration(i, stocks.length, browser, batchId);
							continue;
						}
					}

					const stockHandle = await page.$('span.sal-mip-quote__symbol');
					const stockSymbol = await page.evaluate(span => span.innerHTML, stockHandle);

					await page.waitFor(1000);
	
					let rating = await page.evaluate(() => {
						let ratingElem = [...document.querySelectorAll("span.sal-mip-quote__star-rating > i")];
						return ratingElem.length;
					});
					console.log("rating : ", rating);
					let rowData = {
						userId,
						batchId,
						stockId: row.id,
						stockSymbol: (stockSymbol) ? stockSymbol : row.ticker,
						investmentName,
						currentPrice,
						starRating: rating,
					};
					console.log(rowData);
					await append(rowData);
					await page.waitFor(1000);
					if (processed >= chunkSize) { 
						processed = 0;
						console.log("Browser Closed");
						await browser.close();
						await page.waitFor(2000);
					}
				} else {
					await page.waitForSelector('span.chart-iframe-full-chart-label');

					/* const stockName = await page.evaluate(() => {
						let stockElement = document.querySelector('span.security-info-name');
						return stockElement.textContent;
					});
					console.log("stockName : ", stockName); */
	
					const nameHandle = await page.$('span.security-info-name');
					let stockName = await page.evaluate(span => span.innerHTML, nameHandle);
					stockName  = remove_invalid_characters(stockName);
					// console.log("stockName : ", stockName);

					await page.waitFor(1000);
					let stockElement = await page.$('span.security-info-symbol');
					if (!stockElement) {
						console.log(row.ticker , " - stockElement TRY 1 : ", stockElement);
						await page.waitFor(4000);
						stockElement = await page.$('span.security-info-symbol');
						if (!stockElement) {
							console.log(row.ticker , " - stockElement TRY 2 : ", stockElement);
							let rowData = {
								userId,
								batchId,
								stockId: row.id,
								stockSymbol: row.ticker,
								stockName : '-',
								fairValue: 0,
								currentPrice,
								comment: 'Stock symbol not available'
							};
							// data.push(rowData);
							await append(rowData);
							await page.waitFor(1000);
							if (processed >= chunkSize) { 
								processed = 0;
								console.log("Browser Closed");
								await browser.close();
								await page.waitFor(2000);
							}
							checkNextIteration(i, stocks.length, browser, batchId);
							continue;
						}
					}

					const stockHandle = await page.$('span.security-info-symbol');
					const stockSymbol = await page.evaluate(span => span.innerHTML, stockHandle);
	
					await page.waitFor(1000);
					let labelElement = await page.$('span.legend-label');
					if (!labelElement) {
						console.log(row.ticker , " - labelElement TRY 1 : ", labelElement);
						await page.waitFor(4000);
						labelElement = await page.$('span.legend-label');
						if (!labelElement) {
							console.log(row.ticker , " - labelElement TRY 2 : ", labelElement);
							let rowData = {
								userId,
								batchId,
								stockId: row.id,
								stockSymbol: (stockSymbol) ? stockSymbol : row.ticker,
								stockName,
								fairValue: 0,
								currentPrice,
								comment: 'Fair value not available'
							};
							// data.push(rowData);
							await append(rowData);
							await page.waitFor(1000);
							if (processed >= chunkSize) { 
								processed = 0;
								console.log("Browser Closed");
								await browser.close();
								await page.waitFor(2000);
							}
							checkNextIteration(i, stocks.length, browser, batchId);
							continue;
						}
					}
	
					await page.waitForSelector('span.legend-label');
	
					let legends = await page.evaluate(() => {
						let labels = [...document.querySelectorAll(".legend-items > .legend-item > span.legend-label")];
						return labels.map(label => {
							let labelText = label.textContent.replace(/\n/g, "");
							labelText = labelText.trim();
	
							let valueText = label.nextElementSibling.textContent.replace(/\n/g, "");
							valueText = valueText.trim();
							return { 
								label: labelText,
								value: valueText
							};
						});
					});
					// console.log(legends);
					let fairValue = 0;
					legends.forEach(legend => {
						if (legend.label.toLowerCase() === 'fair value') {
							fairValue = legend.value;
						}
					});
					// console.log(stockName);
					let rowData = {
						userId,
						batchId,
						stockId: row.id,
						stockSymbol: (stockSymbol) ? stockSymbol : row.ticker,
						stockName,
						fairValue,
						currentPrice,
					};
					console.log(rowData);
					await append(rowData);
					await page.waitFor(1000);
					if (processed >= chunkSize) { 
						processed = 0;
						console.log("Browser Closed");
						await browser.close();
						await page.waitFor(2000);
					}
				}
				
				// data.push(rowData);
				// console.log(i + " === " + stocks.length);
				if (i === stocks.length - 1) {
					console.log("--- COMPLETED ---");
					await setBatchStatus(batchId, 'completed');					
					await browser.close();
				}
			}
		} else {
			if (browser) { try { await browser.close(); } catch (error) { console.log("NO BROWSER") } }
			await setBatchStatus(batchId, 'errored', 'No stocks found');
			console.log("NO STOCKS FOUND. PLEASE FETCH THE STCOK FROM POLYGON FIRST.");
		// return res.json({ success: true, message: 'NO STOCKS FOUND. PLEASE FETCH THE STCOK FROM POLYGON FIRST.' });
		}	
		// await browser.close();
	} catch (error) {
		if (browser) { try { await browser.close(); } catch (error) { console.log("NO BROWSER") } }
		const msg = (error && error.message) ? error.message : 'Some error occured';
		await setBatchStatus(batchId, 'errored', msg);
		console.log("ERROR : ", error);
		// next(new ErrorHandler(200, config.common_err_msg, error));
	}
};

module.exports = {
	scrapItems
};