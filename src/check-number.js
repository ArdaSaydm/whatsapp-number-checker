#!/usr/bin/env node

//
// WhatsApp number verification script using 2Chat's public API
// 
// Author: 2Chat Team <support@2chat.co>
// More information at:
//     - https://github.com/2ChatCo/whatsapp-number-checker
//     - https://developers.2chat.co/docs/API/WhatsApp/check-number
//  
//

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const XLSX = require('xlsx');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const args = yargs(hideBin(process.argv))
    .option('input-file',
        {
            alias: 'in',
            type: 'string',
            description: 'Input file containing the list of numbers you want to verify'
        }
    )
    .option('output-file',
        {
            alias: 'out',
            type: 'string',
            description: 'Output file where the script will append the result of each number verification'
        }
    )
    .option('source-number',
        {
            alias: 'number',
            type: 'string',
            description: 'The number connected to 2Chat you want to use to run this script and perform the number verifications'
        }
    )
    .demandOption('input-file')
    .demandOption('output-file')
    .demandOption('source-number')
    .argv;

function sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
} 

async function main() {
    if (!fs.existsSync(args.in)) {
        throw new Error(`Input file [${args.in}] couldn't be found`);
    }

    if (!fs.existsSync(".env")) {
        throw new Error(`Environment file [.env] couldn't be found`);
    }

    if (!process.env.API_KEY) {
        throw new Error(`API_KEY entry is missing in .env file`);
    }

    const numbersToCheck = [];
    const results = [];
    const jsonOutputFile = args.out.replace(/\.(csv|xlsx)$/, '') + '-responses.json';
    
    // Initialize empty JSON file
    fs.writeFileSync(jsonOutputFile, JSON.stringify([], null, 2));

    const headers = [
        "Country", "Locale", "ExternalId2", "FullName", "FirstName", "MiddleName", 
        "LastName", "Phone", "WhatsappConsentStatus", "Email", "EmailConsentStatus", 
        "Persona", "Specialty", "Workplace", "City", "State", "Region", "Brick", 
        "Segment", "on_whatsapp", "is_valid"
    ];

    // Read Excel file
    const workbook = XLSX.readFile(args.in);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Process Excel data
    data.forEach(row => {
        numbersToCheck.push({
            phoneNumber: row.Phone ? (row.Phone.toString().startsWith('+') ? 
                row.Phone.toString() : 
                '+' + row.Phone.toString()) : null,
            rowData: row
        });
    });

    try {
        console.log('Excel file successfully processed. Will check numbers now');

        for (const index in numbersToCheck) {
            const numberData = numbersToCheck[index];
            
            if (!numberData.phoneNumber) {
                // Add row to results without API check if phone is empty
                results.push({
                    ...numberData.rowData,
                    on_whatsapp: false,
                    is_valid: false
                });
                continue;
            }

            await verifyNumber(numberData, results, jsonOutputFile);
            await sleep(1000);
        }

        // Create Excel file after all numbers are checked
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(results, { header: headers });
        XLSX.utils.book_append_sheet(wb, ws, "WhatsApp Status");
        
        // Change file extension to .xlsx
        const outputFile = args.out.replace(/\.(csv|xlsx)$/, '') + '.xlsx';
        XLSX.writeFile(wb, outputFile);
        
        console.log(`Results written to ${outputFile}`);
    }
    catch (e) {
        console.error(e);
    }
}

async function verifyNumber(numberData, results, jsonOutputFile) {
    console.log(`Trying to verify number=[${numberData.phoneNumber}] using source=[${args.number}]`);

    var config = {
        method: 'GET',
        url: `https://api.p.2chat.io/open/whatsapp/check-number/${args.number}/${numberData.phoneNumber}`,
        headers: { 
            'X-User-API-Key': process.env.API_KEY,
            'User-Agent': '2Chat Bulk Verifier'
        }
    };

    try {
        const response = await axios(config);
        const result = response.data;
        
        // Append response to JSON file
        const responseObject = {
            phone: numberData.phoneNumber,
            response: result,
            timestamp: new Date().toISOString()
        };

        // Read current contents, append new response, and write back
        const currentResponses = JSON.parse(fs.readFileSync(jsonOutputFile, 'utf8'));
        currentResponses.push(responseObject);
        fs.writeFileSync(jsonOutputFile, JSON.stringify(currentResponses, null, 2));
        
        results.push({
            ...numberData.rowData,
            on_whatsapp: result?.on_whatsapp ?? false,
            is_valid: result?.is_valid ?? false
        });
    } catch (error) {
        try {
            if (!error?.response) {
                console.error(e);    
            }
            else {
                console.error(`API error: status=[${error.response?.status}] reason=[${error.response?.statusText}]:`, error.response?.data);
                
                //
                // Fatal errors
                //
                if (error.response.status === 401 || error.response.status === 402 || error.response.status === 404) {
                    process.exit(-1);
                }

                console.log(`Checking number=${numberData.phoneNumber} failed. Please retry later.`)
            }
        }
        catch (e) {
            console.error(e);
        }
    }
}

main();
