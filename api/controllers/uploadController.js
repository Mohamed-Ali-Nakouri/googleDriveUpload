const express = require('express');
const router = express.Router();
const fs = require('fs');
const { google } = require('googleapis');
const readline = require('readline');
var admin = require("firebase-admin");
var serviceAccount = require("./../resources/serviceAccountKey");
const path=require('path');
require('dotenv').config({path: './api/.env'});


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.BUCKET_URL
});


exports.upload =  async (req, res, next) => {

    try {

      fs.readFile('./api/resources/credentials.json',  (err, content) => {
           if (err) return console.log('Error loading client secret file:', err);
            // Authorize a client with credentials, then call the Google Drive API.
            authorize(JSON.parse(content), req, admin);

       });

        res.send('done');


    } catch (err) {
        res.send({
            error: err
        });
        throw err;
    }
};


function authorize(credentials,req,admin) {

    const TOKEN_PATH = './api/resources/token.json';
    const {client_secret, client_id, redirect_uris} = credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getAccessToken(oAuth2Client);
        let tokens = JSON.parse(token);
        oAuth2Client.setCredentials(tokens);
        upload_manager(oAuth2Client,req,admin);
        });


}

function getAccessToken(oAuth2Client) {
    const SCOPES = ['https://www.googleapis.com/auth/drive'];
    const TOKEN_PATH = './api/resources/token.json';
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here:', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error retrieving access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            return oAuth2Client;
        });
    });
}



async function upload_manager(auth,req)
{
    let ConsultantfolderName = "Consultant "+req.body.cname;
    let UserfolderName = req.body.uname;
     ConsultantfolderName = ConsultantfolderName.replace(/\s/g, '_');
     UserfolderName = UserfolderName.replace(/\s/g, '_');


    let fileName = Date.now()+"-"+req.file.originalname;
    // Authenticating Drive API
    const drive = google.drive({version: 'v3', auth:auth});
    //Check the existance of the forlder before saving into google drive
    var check = await  checkFolderExists(ConsultantfolderName,drive);
    // Initialize the bucket on Firestore
    let bucket = admin.storage().bucket();
    //Performing the upload operation in the correspondant path
    await bucket.file(ConsultantfolderName+"/"+UserfolderName+"/"+fileName).createWriteStream().end(req.file.buffer);

    if(check.length === 1)
    {
        console.log("Consultant folder exists :"+check[0].id);
        console.log("Checking user folder...");
        let check_user_folder_id = await  checkFolderExists(UserfolderName,drive);
        if(check_user_folder_id.length === 1)
        {
            console.log("User folder exists :"+check_user_folder_id[0].id);
            console.log("Uploading file...");
            let uploadedFile_Id = await uploadFile(fileName,req.file.mimetype,req.file.path,check_user_folder_id[0].id,drive);
        }
        else
        {
            console.log("User folder doesn't exists");
            console.log("Creating user folder...");
            console.log("Uploading file...");
            let user_folder_id = await create_user_directory(check[0].id,UserfolderName,drive);
            let uploadedFile_Id = await uploadFile(fileName,req.file.mimetype,req.file.path,user_folder_id,drive);
        }


    }

    else
    {
        console.log("Creating Consultant folder...");
        console.log("Creating User folder...");
        console.log("Uploading file...");
        let consultant_directory_id = await create_consultant_directory(ConsultantfolderName,UserfolderName,drive);
        let user_folder_id = await create_user_directory(consultant_directory_id,UserfolderName,drive);
        let uploadedFile_Id = await uploadFile(fileName,req.file.mimetype,req.file.path,user_folder_id,drive);
    }


    fs.unlinkSync(req.file.path);

}

async function checkFolderExists(folderName,drive)
{
    var query = " mimeType='application/vnd.google-apps.folder' and name='"+folderName+"'  and trashed=false ";

    const fileExistance =  await new Promise((rest,rej)=>{
        drive.files.list({
            q:query,
            spaces: 'drive'
        }, async function (err, res) {
            if (err) {
                // Handle error
                console.error(err);
            } else {
                rest(res.data.files)
                /*res.data.files.forEach(function (file) {
                  console.log(file);
                })*/
            }
        });
    });
    return await Promise.resolve(fileExistance);
}

async function create_consultant_directory(ConsultantfolderName,UserfolderName,drive)
{

    var fileMetadata = {
        'name': ConsultantfolderName,
        'mimeType': 'application/vnd.google-apps.folder'
    };


    const CDir =  await new Promise((rest,rej)=>{

        drive.files.create({
                resource: fileMetadata,
                fields: 'id'
            },
            function (err, file)
            {
                if (err) {
                    // Handle error
                    console.error(err);
                } else {
                    console.log('Consultant Folder Id: ', file['data'].id);
                    rest(file['data'].id);
                    //create_user_directory(file['data'].id ,UserfolderName,drive);
                }
            });
    });
    return await Promise.resolve(CDir);
}

async function create_user_directory(ConsultantfolderID,UserfolderName,drive)
{

    var fileMetadata = {
        'name': UserfolderName,
        parents: [ConsultantfolderID],
        'mimeType': 'application/vnd.google-apps.folder'
    };

    const UDir =  await new Promise((rest,rej)=>{

        drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        }, function (err, file) {
            if (err) {
                // Handle error
                console.error(err);
            } else {
                console.log('User Folder Id: ', file['data'].id);
                rest(file['data'].id);
                //uploadFile(drive,file['data'].id);
            }
        });
    });
    return await Promise.resolve(UDir);
}

/**
 * Describe with given media and metaData and upload it using google.drive.create method()
 */
async function uploadFile(original_file_name,file_type,file_path,user_folder_id,drive) {

    const fileMetadata = {
        'name': original_file_name,
        parents: [user_folder_id]
    };
    const fileUploaded =  await new Promise((rest,rej)=>{
        const media = {
            mimeType: file_type,
            body: fs.createReadStream(file_path)
        };
        drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        }, (err, file) => {
            if (err) {
                // Handle error
                console.error(err);
            } else {
                console.log('File Id: ', file['data'].id);
                rest(file['data'].id)
            }
        });

    });
    return await Promise.resolve(fileUploaded);
}
