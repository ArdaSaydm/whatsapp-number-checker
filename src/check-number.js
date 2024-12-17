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
    const results = [];  // Store all results here
    const headers = ["ExternalId2", "Phone", "EmailAddress", "WhatsApp", "Email", "Bounce", "Click", "OpenClick", "on_whatsapp"];

    // Read Excel file
    const workbook = XLSX.readFile(args.in);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Process Excel data
    data.forEach(row => {
        if (!row.Phone) return;
        const phoneWithPrefix = row.Phone.toString().startsWith('+') ? 
            row.Phone.toString() : 
            '+' + row.Phone.toString();
            
        numbersToCheck.push({
            phoneNumber: phoneWithPrefix,
            rowData: row
        });
    });

    try {
        console.log('Excel file successfully processed. Will check numbers now');

        for (const index in numbersToCheck) {
            await verifyNumber(numbersToCheck[index], results);

            //
            // we wait 5 seconds to respect the API limits or the request will fail
            //
            await sleep(5000);
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

async function verifyNumber(numberData, results) {
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
        console.log(`${numberData.phoneNumber}:`, result);
        
        results.push({
            ...numberData.rowData,
            on_whatsapp: result?.on_whatsapp
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
