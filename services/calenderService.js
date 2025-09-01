const { NotFoundError, BadRequestError } = require("../errors/HttpError");
const { PrismaClient, calendarAccountType } = require("@prisma/client");
const { cleanUpPhoneNumber } = require("../utils/checkInUtils");
const { callUser } = require("../utils/phoneUtils");
const prisma = new PrismaClient();
const schedule = require("node-schedule");
const { duration } = require("moment-timezone");
const {
    accessTokenJsonUtils,
    createZoomMeetingUtils,
    startUrlUtils,
    zoomUserDetailsUtils,
    generatePassword,
    deleteRecordingUtils,
    addMeetingRregistrant,
    createMeetingPayload,
    createScheduleUtils,
    schedulePayloadUtils,
    getScheduleDetailsUtils,
    getZoomMeetingDetailsUtils,
    deleteScheduleUtils,
    updateScheduleStatusUtils,
    updateScheduleUtils,
    scheduleUrlUtils,
    scheduleEventsInCalenderUtils,
    makeNewSchedule,
} = require("../utils/zoomUtils");
const { get } = require("../routes");
const moment = require("moment-timezone");
const { getAllMSEventsForNextYear, subscribeToMSCalendar, getCalendarEvent } = require('../utils/microsoftUtils')

const addMicrosoftCalender = async ({
    userId,
    name,
    email,
    scope,
    authSub,
}) => {
    console.log(`Function called with params:`, {
        userId,
        name,
        email,
        scope,
        authSub,
    });
    try {
        console.log(`Looking for user with authSub: ${authSub}`);
        const user = await prisma.user.findFirst({
            where: {
                uniqueAuthId: authSub,
            },
        });
        console.log(`User found:`, user);

        if (!user) {
            console.log(`User not found for authSub: ${authSub}`);
            throw new NotFoundError("User not found");
        }
        console.log(`User validation passed`);

        if (!user.organizationId) {
            console.log(`Organization not found for user: ${user.id}`);
            throw new NotFoundError("Organization not found for given user");
        }
        console.log(`Organization validation passed: ${user.organizationId}`);

        const scopeList = scope.split(" ");
        console.log(`Scope list created:`, scopeList);

        console.log(`Creating calendar record...`);
        const calendar = await prisma.calendar.create({
            data: {
                name: name,
                email: email,
                accountType: calendarAccountType.MICROSOFT,
                accountId: userId,
                scope: scopeList,
            },
        });
        console.log(`Calendar created:`, calendar);

        if (!calendar) {
            console.log(`Calendar creation failed`);
            throw new BadRequestError("Error creating calendar");
        }
        console.log(`Calendar validation passed`);

        const calendarId = calendar.id;
        console.log(`Calendar ID: ${calendarId}`);

        console.log(`Updating user with calendarId...`);
        const userCalendar = await prisma.user.update({
            where: {
                id: user.id,
            },
            data: {
                calendarId: calendarId,
            },
        });
        console.log(`User updated:`, userCalendar);

        if (!userCalendar) {
            console.log(`User calendar update failed`);
            throw new BadRequestError("Error updating user calendar");
        }
        console.log(`User calendar update validation passed`);

        const MSUserId = calendar.accountId
        const startDate = new Date()

        const allEvents = (await getAllMSEventsForNextYear(MSUserId, startDate)).value

        const allSchedules = await getScheduleDetailsUtils()
        const oldScheduleArray = allSchedules.items

        let newScheduleArray = JSON.parse(JSON.stringify(oldScheduleArray))

        for (let i = 0; i < allEvents.length; i++) {
          const event = allEvents[i]

          const tenantId = event?.tenantId
          const resourceType = event?.resourceData?.['@odata.type']
          const startTime = event?.start?.dateTime
          const endTime = event?.end?.dateTime
          const email = event?.organizer?.emailAddress?.address
          const timeZone = event?.start?.timeZone

          console.log(`Processing event ${i + 1}:`, {
            tenantId,
            resourceType,
            startTime,
            endTime,
            email,
            timeZone,
          })

          try {
            let temp = await addMicrosoftCalenderWebhook(
              tenantId,
              resourceType,
              startTime,
              endTime,
              email,
              timeZone,
              newScheduleArray
            )
            newScheduleArray = temp

          } catch (eventError) {
            console.error(
              `Error processing event ${i + 1}:`,
              eventError.message
            )
          }
        }
        if (allEvents.length > 0) {
            for (const schedule of oldScheduleArray) {
                for (const newSchedule of newScheduleArray) {
                    if (schedule.schedule_id != undefined && schedule.schedule_id == newSchedule.schedule_id) {
                        console.log(`Found matching schedule ID: ${schedule.schedule_id}`);
                        console.log(`Updating schedule with ID: ${schedule.schedule_id}`);
                        const updatedSchedule = await makeNewSchedule({
                            scheduleDetails: schedule,
                            newScheduleDetails: newSchedule,
                        });
                        console.log(`Schedule updated:`, updatedSchedule);
                    }
                }
            }
        } 

        const subscription = await subscribeToMSCalendar(MSUserId,  `${process.env.BACKEND_URL}/calender/microsoft/webhook`);

        console.log(`Subscription created:`, subscription);

        prisma.calendar.update({
            where: { id: calendarId },
            data: {
                webHookId: subscription.id,
                webHookExpiresAt: subscription.expirationDateTime,
            },
        });

        return

    } catch (error) {
        console.error("Error creating event: ", error.message);
        console.log(`Error stack:`, error.stack);
        throw new Error("Internal Server Error");
    }
};

const addMicrosoftCalenderWebhook = async (
    tenantId,
    resourceType,
    startTime,
    endTime,
    email,
    timeZone,
    scheduleArray
) => {
    console.log(`Function called with params:`, {
        tenantId,
        resourceType,
        startTime,
        endTime,
        email,
        timeZone,
        scheduleArray
    });

    try {
        // Validate input parameters
        if (
            // !tenantId ||
            // !resourceType ||
            !startTime ||
            !endTime ||
            // !email ||
            !timeZone
        ) {
            throw new BadRequestError("Missing required parameters");
        }

        let newScheduleArray = [];

        for (const schedule of scheduleArray) {

            const scheduleDetails = schedule;
            const scheduleRecurrence = scheduleDetails.availability_rules[0].segments_recurrence;
            const scheduleTimeZone = scheduleDetails.availability_rules[0].time_zone;

            const duration = scheduleDetails.duration;

            const removeShortSegmentThanDuration = (segments, duration) => {
                let filteredSegments = [];
                segments.forEach(segment => {
                    const segmentStart = moment(segment.start);
                    const segmentEnd = moment(segment.end);
                    const segmentDuration = moment.duration(segmentEnd.diff(segmentStart));

                    // Check if the segment duration is greater than or equal to the specified duration
                    if (segmentDuration.asMinutes() >= duration) {
                        filteredSegments.push(segment);
                    }
                });
                return filteredSegments;
            }

            

            // Parse the booking times in the specified timezone
            const bookingStart = moment.tz(startTime, timeZone);
            const bookingEnd = moment.tz(endTime, timeZone);
            
            console.log(`Booking times:`, {
                start: bookingStart.format('YYYY-MM-DD HH:mm:ss z'),
                end: bookingEnd.format('YYYY-MM-DD HH:mm:ss z')
            });

            // Convert booking times to schedule timezone for comparison
            const bookingStartInScheduleTz = bookingStart.clone().tz(scheduleTimeZone);
            const bookingEndInScheduleTz = bookingEnd.clone().tz(scheduleTimeZone);

            console.log(`Booking times in schedule timezone (${scheduleTimeZone}):`, {
                start: bookingStartInScheduleTz.format('YYYY-MM-DD HH:mm:ss z'),
                end: bookingEndInScheduleTz.format('YYYY-MM-DD HH:mm:ss z')
            });

            // Get the day of the week for the booking
            const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
            const bookingDay = dayNames[bookingStartInScheduleTz.day()];
            
            console.log(`Booking day: ${bookingDay} (${bookingStartInScheduleTz.format('dddd')})`);

            // Check if there's availability for this day
            const dayRecurrence = scheduleRecurrence[bookingDay];
            if (!dayRecurrence || dayRecurrence.length === 0) {
                console.log(`No availability for ${bookingDay}`);
                // throw new BadRequestError(`No availability for ${bookingDay}`);
            }

            console.log(`Available slots for ${bookingDay}:`, dayRecurrence);

            // Check if booking time falls within any available slot
            let isWithinAvailableSlot = false;
            let availableSlot = null;

            for (const slot of dayRecurrence) {
                // Parse slot times in schedule timezone
                const slotStart = moment.tz(
                    `${bookingStartInScheduleTz.format('YYYY-MM-DD')}T${slot.start}:00`,
                    scheduleTimeZone
                );
                const slotEnd = moment.tz(
                    `${bookingStartInScheduleTz.format('YYYY-MM-DD')}T${slot.end}:00`,
                    scheduleTimeZone
                );

                console.log(`Checking slot: ${slotStart.format('HH:mm')} - ${slotEnd.format('HH:mm')}`);
                console.log(`Booking: ${bookingStartInScheduleTz.format('HH:mm')} - ${bookingEndInScheduleTz.format('HH:mm')}`);

                // Check if booking is completely within this slot
                if (bookingStartInScheduleTz.isSameOrAfter(slotStart) && 
                    bookingEndInScheduleTz.isSameOrBefore(slotEnd)) {
                    isWithinAvailableSlot = true;
                    availableSlot = { start: slotStart, end: slotEnd };
                    console.log(`✅ Booking is within available slot!`);
                    break;
                }
            }

            if (!isWithinAvailableSlot) {
                const availableWindows = dayRecurrence.map(slot => `${slot.start}-${slot.end}`).join(', ');
                console.log(`Booking time not within available slots. Available: ${availableWindows}`);
            }

            // Now handle the schedule update logic
            let newScheduleDetails = { ...scheduleDetails };
            
            // Remove availability_id from availability_rules if it exists
            newScheduleDetails.availability_rules = scheduleDetails.availability_rules.map((rule) => {
                const newRule = { ...rule };
                delete newRule.availability_id;
                return newRule;
            });

            const segmentsArray = scheduleDetails.availability_rules[0].segments || [];
            
            // Check if there are existing segments for this date
            const bookingDate = bookingStartInScheduleTz.format('YYYY-MM-DD');
            const existingSegmentsForDate = segmentsArray.filter(segment => {
                const segmentDate = moment.tz(segment.start, scheduleTimeZone).format('YYYY-MM-DD');
                return segmentDate === bookingDate;
            });

            console.log(`Existing segments for ${bookingDate}:`, existingSegmentsForDate);

            let newSegments = [];

            if (existingSegmentsForDate.length === 0) {
                // No existing segments, create new ones by removing booking time from available slots
                dayRecurrence.forEach(slot => {
                    const slotStart = moment.tz(
                        `${bookingDate}T${slot.start}:00`,
                        scheduleTimeZone
                    );
                    const slotEnd = moment.tz(
                        `${bookingDate}T${slot.end}:00`,
                        scheduleTimeZone
                    );

                    // If booking overlaps with this slot, split it
                    if (bookingStartInScheduleTz.isBefore(slotEnd) && bookingEndInScheduleTz.isAfter(slotStart)) {
                        // Add segment before booking if it exists
                        if (slotStart.isBefore(bookingStartInScheduleTz)) {
                            newSegments.push({
                                start: slotStart.toISOString(),
                                end: bookingStartInScheduleTz.toISOString()
                            });
                        }

                        // Add segment after booking if it exists
                        if (slotEnd.isAfter(bookingEndInScheduleTz)) {
                            newSegments.push({
                                start: bookingEndInScheduleTz.toISOString(),
                                end: slotEnd.toISOString()
                            });
                        }
                    } else {
                        // Keep the original slot if no overlap
                        newSegments.push({
                            start: slotStart.toISOString(),
                            end: slotEnd.toISOString()
                        });
                    }
                });
                
                // Combine with segments from other dates
                const segmentsFromOtherDates = segmentsArray.filter(segment => {
                    const segmentDate = moment.tz(segment.start, scheduleTimeZone).format('YYYY-MM-DD');
                    return segmentDate !== bookingDate;
                });
                
                newSegments = [...segmentsFromOtherDates, ...newSegments];
            } else {
                // Keep all segments from other dates unchanged
                const segmentsFromOtherDates = segmentsArray.filter(segment => {
                    const segmentDate = moment.tz(segment.start, scheduleTimeZone).format('YYYY-MM-DD');
                    return segmentDate !== bookingDate;
                });
                
                // Process only segments for the current booking date
                const updatedSegmentsForCurrentDate = [];
                
                existingSegmentsForDate.forEach(segment => {
                    const segmentStart = moment.tz(segment.start, scheduleTimeZone);
                    const segmentEnd = moment.tz(segment.end, scheduleTimeZone);

                    // If booking overlaps with this segment, split it
                    if (bookingStartInScheduleTz.isBefore(segmentEnd) && bookingEndInScheduleTz.isAfter(segmentStart)) {
                        // Add segment before booking if it exists
                        if (segmentStart.isBefore(bookingStartInScheduleTz)) {
                            updatedSegmentsForCurrentDate.push({
                                start: segmentStart.toISOString(),
                                end: bookingStartInScheduleTz.toISOString()
                            });
                        }

                        // Add segment after booking if it exists
                        if (segmentEnd.isAfter(bookingEndInScheduleTz)) {
                            updatedSegmentsForCurrentDate.push({
                                start: bookingEndInScheduleTz.toISOString(),
                                end: segmentEnd.toISOString()
                            });
                        }
                    } else {
                        // Keep the original segment if no overlap
                        updatedSegmentsForCurrentDate.push(segment);
                    }
                });

                // Combine segments from other dates with updated segments for current date
                newSegments = [...segmentsFromOtherDates, ...updatedSegmentsForCurrentDate];
            }

            filteredSegments = removeShortSegmentThanDuration(newSegments, duration);

            // Update the schedule with new segments
            newScheduleDetails.availability_rules[0].segments = filteredSegments;

            console.log(`Updated segments:`, filteredSegments);
            newScheduleArray.push(newScheduleDetails);
        }

        return newScheduleArray

    } catch (error) {
        console.error("Error creating webhook subscription: ", error.message);
        throw new Error("Internal Server Error");
    }
};



module.exports = {
    addMicrosoftCalender,
    addMicrosoftCalenderWebhook
};
