const fs = require('fs');
const XLSX = require('xlsx');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

function sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

async function verifyNumber(phoneNumber, sourceNumber) {
    var config = {
        method: 'GET',
        url: `https://api.p.2chat.io/open/whatsapp/check-number/${sourceNumber}/${phoneNumber}`,
        headers: { 
            'X-User-API-Key': process.env.API_KEY,
            'User-Agent': '2Chat Bulk Verifier'
        }
    };

    try {
        const response = await axios(config);
        return {
            is_valid: response.data?.is_valid ?? false,
            on_whatsapp: response.data?.on_whatsapp ?? false
        };
    } catch (error) {
        console.error(`Error verifying number ${phoneNumber}:`, error.message);
        return null;
    }
}

async function main() {
    if (!process.env.API_KEY) {
        throw new Error('API_KEY entry is missing in .env file');
    }

    const sourceNumber = process.argv[2];
    if (!sourceNumber) {
        throw new Error('Please provide source number as command line argument');
    }

    // Read the JSON responses
    const jsonFile = path.resolve(__dirname, 'Report-results-responses.json');
    const responseData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

    // Create a map of phone numbers to results
    const phoneResults = new Map();
    responseData.forEach(item => {
        phoneResults.set(item.phone, {
            is_valid: item.response.is_valid,
            on_whatsapp: item.response.on_whatsapp
        });
    });

    // Read Excel file
    const excelFile = path.resolve(__dirname, 'Report.xlsx');
    const workbook = XLSX.readFile(excelFile);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Process each row and create new results
    const results = [];
    for (const row of data) {
        const phoneNumber = row.Phone ? 
            (row.Phone.toString().startsWith('+') ? row.Phone.toString() : '+' + row.Phone.toString()) 
            : null;

        let result = phoneResults.get(phoneNumber);
        let is_not_found = false;

        if (!result && phoneNumber) {
            console.log(`Checking missing number: ${phoneNumber}`);
            result = await verifyNumber(phoneNumber, sourceNumber);
            // await sleep(1000);
            is_not_found = true;
        }

        results.push({
            ...row,
            on_whatsapp: result ? result.on_whatsapp : 'NOT_FOUND',
            is_valid: result ? result.is_valid : 'NOT_FOUND',
            is_not_found: is_not_found
        });
    }

    // Create new Excel file with results
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(results);
    XLSX.utils.book_append_sheet(wb, ws, "Complete Results");
    
    const currentDate = new Date().toISOString().split('T')[0];
    const outputFile = path.resolve(__dirname, `Report-with-missing-${currentDate}.xlsx`);
    XLSX.writeFile(wb, outputFile);
    
    console.log(`Results written to ${outputFile}`);
    
    // Print statistics
    const totalRecords = results.length;
    const missingRecords = results.filter(r => r.is_valid === 'NOT_FOUND').length;
    const newlyCheckedRecords = results.filter(r => r.is_not_found).length;
    console.log(`Total records: ${totalRecords}`);
    console.log(`Missing records: ${missingRecords}`);
    console.log(`Newly checked records: ${newlyCheckedRecords}`);
}

main().catch(console.error);