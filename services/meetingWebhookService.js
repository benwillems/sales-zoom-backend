const { PrismaClient, AppointmentStatus } = require('@prisma/client');
const { Buffer } = require('buffer');
const prisma = new PrismaClient();
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-west-2', // e.g., 'us-west-1'
});
const s3 = new AWS.S3();
const fs = require('fs')
const path = require('path')
const os = require('os')
const bucketName = process.env.S3_BUCKET_NAME;
const {
    generateNotesForAppointment,
} = require('../utils/audioAppointmentUtils');

const {
    getSignedUrl,
    getFileFromS3,
    generateAppointmentPreSignedUrls,
    uploadBufferToS3,
    getPresignedUrl,
  } = require('../utils/s3utils')
const {
    mergeAudioFiles,
    extractSummaryFromAudioTranscript,
    transcribeAudio,
    processAudioFiles,
    summaryListToBullet,
    fillDefaults,
    createTranscriptionPdf,
    generateNotesForEmailFromAI,
    renerateEmailFromAppointment,
  } = require('../utils/audioAppointmentUtils')

const statedMeeting = async ({ meetingId, meetingUUID }) => {
    const appointment = await prisma.appointment.findFirst({
        where: {
            status: AppointmentStatus.MEETING_STARTED,
            zoomMeeting: {
                meetingId: meetingId,
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
    await prisma.appointment.update({
        where: {
            id: appointment.id,
        },
        data: {
            meetingUUID: meetingUUID,
            status: AppointmentStatus.RECORDING,
        },
    });
    return { status: 'success' };
};

const endMeeting = async ({ meetingId, meetingUUID }) => {
    const appointment = await prisma.appointment.findFirst({
        where: {
            zoomMeeting:{
                meetingId: BigInt(meetingId),
            },
            meetingUUID: meetingUUID,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
    if (!appointment) {
      console.log(
        `appointment not found for meetingId ${meetingId} and meetingUUID ${meetingUUID}`
      )
      return
    }
    await prisma.appointment.update({
        where: {
            id: appointment.id,
        },
        data: {
            status: AppointmentStatus.PROCESSING,
        },
    });
    return { status: 'success' };
};

const recordingCompleted = async (recordingObject) => {
    const downloadToken = recordingObject.download_token;
    const meetingId = recordingObject.payload?.object?.id;
    const meetingUUID = recordingObject.payload?.object?.uuid;
    const recordingFiles = recordingObject.payload?.object?.recording_files;

    if (!recordingFiles || recordingFiles.length < 1) {
        console.log('No recording files');
        return;
    }

    const appointment = await prisma.appointment.findFirst({
        where: {
            zoomMeeting:{
                meetingId: BigInt(meetingId),
            },
            meetingUUID: meetingUUID,
        },
        orderBy: {
            createdAt: 'desc',
        },
        include: {
            client: true,
        },
    });
    if (!appointment) {
        console.log(`appointment not found for meetingId ${meetingId} and meetingUUID ${meetingUUID}`);
        return;
    }

    if (appointment.status !== AppointmentStatus.MEETING_ENDED && appointment.status !== AppointmentStatus.PROCESSING) { 
        console.log(`appointment status is not MEETING_ENDED or PROCESSING for meetingId ${meetingId} and meetingUUID ${meetingUUID}`);
        return;
    }
    console.log('Meeting appointment ', appointment);

    let durationMilliseconds = 0;

    for (const file of recordingFiles) {
        if (file.file_type == 'M4A' && file.recording_type == 'audio_only') {
            const recordingStart = new Date(file.recording_start).getTime();
            const recordingEnd = new Date(file.recording_end).getTime();
            durationMilliseconds += recordingEnd - recordingStart;
            console.log('Downloading file ', file.download_url);
            const response = await fetch(file.download_url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${downloadToken}`,
                    'Content-Type': 'application/json',
                },
            });

            const buffer = await response.arrayBuffer();
            const arrayBuffer = Buffer.from(buffer);
            const timestamp = Date.now();
            const key = `appointments/${appointment.id}/${timestamp}.m4a`;
            console.log('Uploading to s3 key ', key);
            const s3Res = await uploadBufferToS3(arrayBuffer, bucketName, key);
            console.log('Uploaded to s3 ', s3Res);
        }
    }
    
    if (!(appointment?.templateId)) {
        await prisma.appointment.update({
            where: {
                id: appointment.id,
            },
            data: {
                status: AppointmentStatus.WAITING_FOR_TEMPLATE_INPUT,
                currentTimerMili: durationMilliseconds,
            },
        });
        return;
    }

    await generateNotesForAppointment({
        appointment: appointment,
        bucketName: bucketName,
    });
};

module.exports = {
    statedMeeting,
    endMeeting,
    recordingCompleted,
};
