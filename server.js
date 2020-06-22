const puppeteer = require('puppeteer');
const fs = require('fs');
const csv = require('fast-csv');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const chunkSize = 50;
let processed = 0;

/**
 * Read CSV file
 */
const read_file = async () =>{
	return new Promise( async (resolve, reject) => {
		let fileRows = [];
		fs.createReadStream(path.resolve(__dirname, 'assets', 'companylist.csv'))
		.pipe(csv.parse({ headers: true }))
		.on('error', error => reject(error))
		.on('data', row => fileRows.push(row))
		.on('end', (rowCount) => {
			console.log(`Parsed ${rowCount} rows`);
			resolve(fileRows);
		});
	});
};

/**
 * Append scrapped data in output file
 * 
 * @param {Object} rows 
 */
const append = (row) => {
	const rowData = {
		userId: row.userId,
		stockSymbol: row.stockSymbol,
		stockName: row.stockName ? row.stockName : '-',
		fairValue: (row.fairValue !== null && row.fairValue !== undefined) ? row.fairValue : 0,
		investmentName: row.investmentName ? row.investmentName : '-',
		starRating: row.starRating ? row.starRating : '-',
		analystRating: row.analystRating ? row.analystRating : '-',
		comment: row.comment,
	};
	processed++;
    const csvFile = fs.createWriteStream("assets/output.csv", { flags: 'a' });
    csvFile.write('\n');
	csv.writeToStream(csvFile, [rowData], { headers: false });
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
		await page.waitFor(5000); // Wait for 5 seconds

		await page.goto(process.env.LOGIN_URL);
		await page.type('[name="user"]', process.env.USERNAME);
		await page.type('[name="pass"]', process.env.PASSWORD);
		
		const form = await page.$('#access-databases');
		await form.evaluate(form => form.submit());
		console.log("LOGIN");
		await page.waitForNavigation();
		await page.waitForSelector('a[href^="/Selectors/Fund/Selector.html"]');
		await page.goto(process.env.FUNDS_URL);
		console.log("REDIRECTED TO FUNDS PAGE");
		// await page.waitForNavigation();
		return { browser, page };
	} catch (error) {
		await browser.close();
		console.log(error);
	}
};

(async () => {
	try {		
		const fileData = await read_file();

		if (fileData.length) {
			console.log("length : ",fileData.length);
			for (let i = 0; i < Object.keys(fileData).length; i++) {
				const row = fileData[i];
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
				await page.type('input#AutoCompleteBox', row.Symbol);
				await page.waitFor(4000);

				let dropDownElement = await page.$('table.ACDropDownStyle');
				if (!dropDownElement) {
					console.log(row.Symbol , " - dropDownElement TRY 1 : ", dropDownElement);
					await page.waitFor(6000);
					dropDownElement = await page.$('table.ACDropDownStyle');
					if (!dropDownElement) {
						console.log(row.Symbol , " - dropDownElement TRY 2 : ", dropDownElement);
						let rowData = {
							userId: process.env.USERNAME,
							stockSymbol: row.Symbol,
							stockName: '-',
							fairValue: 0,
							comment: 'No result in autocomplete search'
						};
						append(rowData);
						await page.waitFor(1000);
						if (processed >= chunkSize) { 
							processed = 0;
							console.log("Browser Closed");
							await browser.close();
							await page.waitFor(2000);
						}
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
					console.log(row.Symbol , " - nameElement TRY 1 : ", nameElement);
					await page.waitFor(4000);
					nameElement = await page.$('span.security-info-name');
					if (!nameElement) {
						console.log(row.Symbol , " - nameElement TRY 2 : ", nameElement);
						normalFormat = false;
					}
				}

				if (!normalFormat) {
					let investmentNameElement = await page.$('span.sal-mip-quote__investment-name'), normalFormat = true;
					if (!investmentNameElement) {
						console.log(row.Symbol , " - investmentNameElement TRY 1 : ", investmentNameElement);
						await page.waitFor(4000);
						investmentNameElement = await page.$('span.sal-mip-quote__investment-name');
						if (!investmentNameElement) {
							console.log(row.Symbol , " - investmentNameElement TRY 2 : ", investmentNameElement);
							let rowData = {
								userId: process.env.USERNAME,
								stockSymbol,
								stockName: '-',
								fairValue: 0,
								comment: 'Investment Name field not found'
							};
							// data.push(rowData);
							append(rowData);
							await page.waitFor(1000);
							if (processed >= chunkSize) { 
								processed = 0;
								console.log("Browser Closed");
								await browser.close();
								await page.waitFor(2000);
							}
							continue;
						}
					}

					const investmentNameHandle = await page.$('span.sal-mip-quote__investment-name');
					const investmentName = await page.evaluate(span => span.innerHTML, investmentNameHandle);


					// await page.waitFor(1000);
					let stockElement = await page.$('span.sal-mip-quote__symbol');
					if (!stockElement) {
						console.log(row.Symbol , " - stockElement TRY 1 : ", stockElement);
						await page.waitFor(4000);
						stockElement = await page.$('span.sal-mip-quote__symbol');
						if (!stockElement) {
							console.log(row.Symbol , " - stockElement TRY 2 : ", stockElement);
							let rowData = {
								userId: process.env.USERNAME,
								stockSymbol: row.Symbol,
								investmentName,
								fairValue: 0,
								comment: 'Stock symbol not available'
							};
							// data.push(rowData);
							append(rowData);
							await page.waitFor(1000);
							if (processed >= chunkSize) { 
								processed = 0;
								console.log("Browser Closed");
								await browser.close();
								await page.waitFor(2000);
							}
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
						userId: process.env.USERNAME,
						stockSymbol,
						investmentName,
						starRating: rating,
					};
					console.log(rowData);
					append(rowData);
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
					const stockName = await page.evaluate(span => span.innerHTML, nameHandle);
					// console.log("stockName : ", stockName);

					await page.waitFor(1000);
					let stockElement = await page.$('span.security-info-symbol');
					if (!stockElement) {
						console.log(row.Symbol , " - stockElement TRY 1 : ", stockElement);
						await page.waitFor(4000);
						stockElement = await page.$('span.security-info-symbol');
						if (!stockElement) {
							console.log(row.Symbol , " - stockElement TRY 2 : ", stockElement);
							let rowData = {
								userId: process.env.USERNAME,
								stockSymbol: row.Symbol,
								stockName : '-',
								fairValue: 0,
								comment: 'Stock symbol not available'
							};
							// data.push(rowData);
							append(rowData);
							await page.waitFor(1000);
							if (processed >= chunkSize) { 
								processed = 0;
								console.log("Browser Closed");
								await browser.close();
								await page.waitFor(2000);
							}
							continue;
						}
					}

					const stockHandle = await page.$('span.security-info-symbol');
					const stockSymbol = await page.evaluate(span => span.innerHTML, stockHandle);
	
					await page.waitFor(1000);
					let labelElement = await page.$('span.legend-label');
					if (!labelElement) {
						console.log(row.Symbol , " - labelElement TRY 1 : ", labelElement);
						await page.waitFor(4000);
						labelElement = await page.$('span.legend-label');
						if (!labelElement) {
							console.log(row.Symbol , " - labelElement TRY 2 : ", labelElement);
							let rowData = {
								userId: process.env.USERNAME,
								stockSymbol: row.Symbol,
								stockName,
								fairValue: 0,
								comment: 'Fair value not available'
							};
							// data.push(rowData);
							append(rowData);
							await page.waitFor(1000);
							if (processed >= chunkSize) { 
								processed = 0;
								console.log("Browser Closed");
								await browser.close();
								await page.waitFor(2000);
							}
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
						userId: process.env.USERNAME,
						stockSymbol,
						stockName,
						fairValue
					};
					console.log(rowData);
					append(rowData);
					await page.waitFor(1000);
					if (processed >= chunkSize) { 
						processed = 0;
						console.log("Browser Closed");
						await browser.close();
						await page.waitFor(2000);
					}
				}
				
				// data.push(rowData);
				continue;
			}

			// console.log(data);
			// console.log(data.length);
			// await browser.close();
			// console.log("Browser Closed");
		} else {
			console.log("NO RECORDS FOUND IN CSV");
			await browser.close();
		}	
		// await browser.close();
	} catch (error) {
		await browser.close();
		console.log(error);
	}
})();