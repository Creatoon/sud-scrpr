const axios = require("axios");
const retry = require("axios-retry");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const url =
  "https://www.topuniversities.com/universities/united-states?country=[US]&sorting=[rankings_htol]";

const axiosInstance = axios.create({
  // Set a timeout of 5 seconds
});

// Define the number of retries and the delay between retries
retry(axiosInstance, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 1000,
});

async function main(url) {
  try {
    const browser = await puppeteer.launch({ headless: false, timeout: 60000 });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    await page.goto(url);

    const colleges = await page.evaluate(() => {
      const colleges = [];
      const rows = document.querySelectorAll(".row .university-wrap");

      rows.forEach((row) => {
        console.log("1");
        const collegeLinkElem = row.querySelector("h2 a");
        const collegeLink = collegeLinkElem ? collegeLinkElem.href : "";
        const collegeNameElem = row.querySelector(".bold-text");
        const collegeName = collegeNameElem
          ? collegeNameElem.textContent.trim()
          : "";
        colleges.push({ collegeLink, collegeName });
      });

      return colleges;
    });

    // console.log(colleges);
    await lookInsideCourses(colleges);

    await browser.close();
  } catch (error) {
    console.error(error);
  }
}

async function runLoop() {
  for (let i = 1; i <= 1; i++) {
    // const url = `https://www.topuniversities.com/universities/united-states?country=[US]&page=[45]&pagerlimit=[25]&sorting=[rankings_htol]`;
    const url = `https://www.topuniversities.com/universities/united-states?country=[US]&sorting=[alpha_atoz]`;
    // console.log(i);
    await main(url);
  }
}

runLoop();

const c = [];
c.push({
  collegeLink:
    "https://www.topuniversities.com/universities/clarkson-university",
  collegeName: "Clarkson University",
});
// lookInsideCourses(c);

async function lookInsideCourses(pgCourses) {
  const browser = await puppeteer.launch({ headless: false, timeout: 60000 });

  const page = await browser.newPage();

  try {
    // console.log("start of lookInsideCourses")
    for (const course of pgCourses) {
      try {
        // console.log(course.collegeLink);
        await page.goto(course.collegeLink, { timeout: 60000 });
        await page.waitForSelector(".content");

        const html = await page.content();
        const $ = cheerio.load(html);

        const collegeDetail = {};
        const collegeDetails = [];
        collegeDetail["University Name"] = course.collegeName;
        const paragraphElements = await page.$(".details");
        if (paragraphElements) {
          const text = await paragraphElements.evaluate((e) =>
            e.textContent.trim()
          );

          collegeDetail["About College"] = text;
        }
        const data = await page.evaluate(() => {
          const sections = document.querySelectorAll(
            ".univ-subsection-full-width-parent"
          );
          const result = {};
          sections.forEach((section) => {
            const title = section.querySelector(
              ".univ-subsection-full-width-title"
            ).textContent;
            const items = section.querySelectorAll(
              ".univ-subsection-full-width-div .univ-subsection-full-width-value"
            );
            const obj = {};
            items.forEach((item) => {
              const label = item.querySelector("label").textContent;
              const value = item.querySelector("div").textContent;
              obj[label] = value;
            });
            result[title] = obj;
          });
          return result;
        });

        collegeDetail["Entry Requirements"] = JSON.stringify(data);

        const be = await page.$("div.container.badge-div");
        if (be) {
          const keyValuePairs = await page.$$eval(
            ".badge-description",
            (elements) => {
              const result = {};
              elements.forEach((element) => {
                let key =
                  element
                    .querySelector(".single-badge-title")
                    ?.textContent.trim() ?? "";
                const value = element.textContent.replace(key, "").trim();
                key = key.replace(":", "");
                if (key === "UCAS course code" || key === "Programme code") {
                  key = "Course Code";
                }
                if (key === "Start date") key = "Start Date";
                result[key] = value;
              });
              return result;
            }
          );
          // console.log(keyValuePairs);
          Object.assign(collegeDetail, keyValuePairs);
        }
        const fee = {};
        const feeElements = await page.$$(".univ-subsection");
        if (feeElements) {
          const subsectionElems = await page.$$(".univ-subsection");
          for (const subsectionElem of subsectionElems) {
            const headingElem = await subsectionElem.$("h4");
            const heading = await headingElem.evaluate((element) =>
              element.textContent.trim()
            );

            const subsectionData = {};
            const valueElems = await subsectionElem.$$(
              ".univ-subsection-value"
            );
            for (const valueElem of valueElems) {
              const labelElem = await valueElem.$("label");
              const label = await labelElem.evaluate((element) =>
                element.textContent.trim()
              );

              const contentElem = await valueElem.$("div");
              const content = await contentElem.evaluate((element) =>
                element.textContent.trim()
              );

              subsectionData[label] = content;
            }

            fee[heading] = subsectionData;
          }
        }
        collegeDetail["Fees"] = JSON.stringify(fee);
        //saving collge details
        collegeDetails.push(collegeDetail);
        const header = Object.keys(collegeDetails[0]);

        let directory = `US universities data/countries/us/${course.collegeName}`;
        if (!fs.existsSync(`${directory}`)) {
          fs.mkdirSync(`${directory}`, { recursive: true });
        }
        const filePath = path.join(
          directory,
          `About_${course.collegeName}.csv`
        );
        const csvWriter = createCsvWriter({
          path: filePath,
          header: header.map((key) => ({ id: key, title: key })),
        });

        csvWriter
          .writeRecords(collegeDetails)
          .then(() => {
            console.log(
              `About_${course.collegeName}.csv file successfully written`
            );
          })
          .catch((error) => {
            console.error(error);
          });

        const contents = await page.$$("#aptabs .nav-link");

        const tabs = await page.$$("#aptabsContent .tab-pane");
        const indexesToRemove = [];
        for (let i = 0; i < contents.length; i++) {
          const content = contents[i];
          const contentHeader = await content.$("h3 span");
          if (contentHeader) {
            const headerText = await contentHeader.evaluate((el) =>
              el.textContent.trim()
            );
            if (headerText === "Featured programs") {
              indexesToRemove.push(i);
            }
          }
        }

        // Remove the elements from both arrays in reverse order
        for (let i = indexesToRemove.length - 1; i >= 0; i--) {
          const index = indexesToRemove[i];
          contents.splice(index, 1);
          tabs.splice(index, 1);
        }
        for (let i = 0; i < tabs.length; i++) {
          var coursesLinks = [];
          const tab = tabs[i];
          const content = contents[i];
          const typeOfCourse = await tab.evaluate((tab) =>
            tab.getAttribute("id").replace("tab", "")
          );
          console.log(typeOfCourse);
          await content.click();

          // Click on the "load-more-dep" button (if it exists)
          const loadMoreButton = await tab.$(".load-more-dep");
          if (loadMoreButton) {
            await loadMoreButton.click();
          }
          await tab.waitForSelector(".item");

          const items = await tab.$$(".item");

          for (const item of items) {
            let retryCount = 3;
            while (retryCount > 0) {
              try {
                await item.waitForSelector("a.collapse_heading", {
                  timeout: 10000,
                });
                const aTag = await item.$("a.collapse_heading");
                while (!(await item.$("div.collapse.show"))) {
                  await aTag.click();
                }

                const viewAllTag = await item.$(".view-all-programs-btn");
                if (viewAllTag) {
                  await viewAllTag.click();
                }
                await item.waitForSelector(".views-row", { timeout: 10000 });
                const allCourses = await item.$$(".views-row");
                for (const allCourse of allCourses) {
                  let courseRetryCount = 3;
                  while (courseRetryCount > 0) {
                    try {
                      await allCourse.waitForSelector(".inside-tabs", {
                        timeout: 10000,
                      });
                      let courseLink = await allCourse.$(".inside-tabs");
                      while (!courseLink) {
                        courseLink = await allCourse.$(".inside-tabs");
                      }
                      if (courseLink) {
                        await courseLink.click();
                        await allCourse.waitForSelector(".loader.d-none", {
                          timeout: 20000,
                        });

                        const data = await page.evaluate(() => {
                          const infoElements =
                            document.querySelectorAll(".title-information");
                          const data = {};
                          for (const element of infoElements) {
                            const title = element
                              .querySelector(".title")
                              .textContent.trim();
                            const description = element
                              .querySelector(".description")
                              .textContent.trim();
                            data[title] = description;
                          }
                          return data;
                        });

                        const link = await allCourse.$eval(
                          ".btn_view_details",
                          (course) =>
                            "https://www.topuniversities.com" +
                            course.getAttribute("href")
                        );

                        coursesLinks.push({ link, data });

                        break;
                      }
                    } catch (error) {
                      courseRetryCount--;
                      if (courseRetryCount === 0) {
                        console.log(
                          `Failed to extract information for course: ${error}`
                        );
                      } else {
                        console.log(
                          `Retrying...for courses ${courseRetryCount} attempts left`
                        );
                        console.log(error);
                      }
                    }
                  }
                }
                break;
              } catch (error) {
                retryCount--;
                if (retryCount === 0) {
                  console.log(
                    `Failed to extract information for item: ${error}`
                  );
                } else {
                  console.log(
                    `Retrying...for item ${retryCount} attempts left`
                  );
                  console.log(error);
                }
              }
            }
          }

          // console.log(coursesLinks);
          lookInsideCoursesUG(
            coursesLinks,
            `${course.collegeName}_${typeOfCourse}_courses`,
            `US universities data/countries/us/${course.collegeName}`
          );
        }
      } catch (error) {
        console.error(error);
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    await browser.close();
  }
}

// lookInsideCoursesUG(
//   [
//     {
//       link: "https://www.topuniversities.com/universities/clarkson-university/mba/business-administration-online-mba",
//       data: {
//         "Degree Name": "MBA",
//         "Study Level": "MBA",
//         "Course Intensity": "Full Time",
//         "Study Mode": "Online",
//         "Broad Subject Area": "Business and Management",
//       },
//     },
//   ],
//   "test",
//   "test/a"
// );

async function lookInsideCoursesUG(Courses, name, directory) {
  const courseDetails = [];
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  // console.log(Courses.length);
  const errorLinks = [];
  for (const course of Courses) {
    try {
      // console.log(course);

      page.setDefaultTimeout(180000);
      await page.goto(course.link);
      const courseDetail = {};
      Object.assign(courseDetail, course.data);

      var courseNameElement = await page.$("h1");

      let courseName;
      if (courseNameElement) {
        // console.log("first")
        courseName = await courseNameElement.evaluate((element) =>
          element.textContent.trim()
        );
      }
      // console.log("courseName", courseName);
      courseDetail["Course Name"] = courseName;

      var locationElement = await page.$("h2.hero-campus-heading");

      let location;
      if (locationElement) {
        // console.log("first")
        location = await locationElement.evaluate((element) =>
          element.textContent.trim()
        );
      }
      // console.log("location", location);

      courseDetail["Location"] = location;
      const paragraphElements = await page.$(".details");
      if (paragraphElements) {
        const text = await paragraphElements.evaluate((e) =>
          e.textContent.trim()
        );

        courseDetail["About Course"] = text;
      }

      // Extract the text content of the elements, if they exist
      const be = await page.$("div.container.badge-div");
      if (be) {
        const keyValuePairs = await page.$$eval(
          ".badge-description",
          (elements) => {
            const result = {};
            elements.forEach((element) => {
              let key =
                element
                  .querySelector(".single-badge-title")
                  ?.textContent.trim() ?? "";
              const value = element.textContent.replace(key, "").trim();
              key = key.replace(":", "");
              if (key === "UCAS course code" || key === "Programme code") {
                key = "Course Code";
              }
              if (key === "Start date") key = "Start Date";
              result[key] = value;
            });
            return result;
          }
        );
        // console.log(keyValuePairs);
        Object.assign(courseDetail, keyValuePairs);
      }
      const be1 = await page.$("div.prog-view-highli-parent");
      if (be1) {
        const keyValuePairs = await page.$$eval(
          "div.prog-view-highli-parent > div",
          (elements) => {
            const result = {};
            elements.forEach((element) => {
              let key = element.querySelector("h3")?.textContent.trim() ?? "";
              const value = element.textContent.replace(key, "").trim();
              key = key.replace(":", "");
              if (key === "UCAS course code" || key === "Programme code") {
                key = "Course Code";
              }
              if (key === "Start date") key = "Start Date";
              result[key] = value;
            });
            return result;
          }
        );
        // console.log(keyValuePairs);
        Object.assign(courseDetail, keyValuePairs);
      }

      var fee = {};

      const entryReqElems = await page.$$(".univ-subsection-full-width-value");
      if (entryReqElems) {
        let entryReq = {};
        for (const entryReqElem of entryReqElems) {
          const label = await entryReqElem.$eval("label", (e) =>
            e.textContent.trim()
          );
          const value = await entryReqElem.$eval("div", (e) =>
            e.textContent.trim()
          );
          if (
            label.toLowerCase().includes("duration") ||
            label.toLowerCase().includes("month")
          ) {
            courseDetail[label] = value;
          } else {
            entryReq[label] = value;
          }
        }
        // console.log(entryReq);
        courseDetail["Entry Requirements"] = JSON.stringify(entryReq);
      }

      const feeElements = await page.$$(".univ-subsection");
      if (feeElements) {
        const subsectionElems = await page.$$(".univ-subsection");
        for (const subsectionElem of subsectionElems) {
          const headingElem = await subsectionElem.$("h4");
          const heading = await headingElem.evaluate((element) =>
            element.textContent.trim()
          );

          const subsectionData = {};
          const valueElems = await subsectionElem.$$(".univ-subsection-value");
          for (const valueElem of valueElems) {
            const labelElem = await valueElem.$("label");
            const label = await labelElem.evaluate((element) =>
              element.textContent.trim()
            );

            const contentElem = await valueElem.$("div");
            const content = await contentElem.evaluate((element) =>
              element.textContent.trim()
            );

            subsectionData[label] = content;
          }

          fee[heading] = subsectionData;
        }
      }
      courseDetail["Fees"] = JSON.stringify(fee);
      // console.log(fee); // "2023/24 tuition fees for international students: £15,250."

      var data;
      const entryElement = await page.$(".entryContent");

      if (entryElement) {
        data = await entryElement.evaluate((element) =>
          element.textContent.trim()
        );
        courseDetail["Entry Requirements"] = JSON.stringify(data);
      }

      // console.log(courseDetail)

      courseDetails.push(courseDetail);
    } catch (error) {
      errorLinks.push({ "Error Link": course });
      console.log(error);
    }
  }

  const filePath = path.join(directory, `${name}.csv`);
  const csvWriter = createCsvWriter({
    path: filePath,
    header: [
      { id: "Course Name", title: "Course Name" },
      { id: "About Course", title: "About Course" },
      { id: "Program duration", title: "Program duration" },
      { id: "Main Subject Area", title: "Main Subject Area" },
      { id: "Study Level", title: "Study Level" },
      { id: "Starting Month(s)", title: "Starting Month(s)" },

      { id: "Study Mode", title: "Study mode" },
      { id: "Degree", title: "Degree" },
      { id: "Degree Name", title: "Degree Name" },
      { id: "Course Intensity", title: "Course Intensity" },
      { id: "Broad Subject Area", title: "Broad Subject Area" },
      { id: "Location", title: "Location" },
      { id: "Entry Requirements", title: "Entry Requirements" },
      { id: "Fees", title: "Fees" },
      { id: "Scholarships", title: "Scholarships" },
    ],
  });
  if (!fs.existsSync(`${directory}/errorLinks`)) {
    fs.mkdirSync(`${directory}/errorLinks`, { recursive: true });
  }
  await csvWriter.writeRecords(courseDetails).then(() => {
    console.log(`${name}` + " file has been written successfully!");
  });
  const errorCsvWriter = createCsvWriter({
    path: path.join(`${directory}/errorLinks`, `${name}_errors.csv`),
    header: [{ id: "Error Link", title: "Error Link" }],
  });

  // Write the error links to the CSV file
  await errorCsvWriter.writeRecords(errorLinks).then(() => {
    console.log(`${name}_errors.csv` + " file has been written successfully!");
  });
  console.log("errors in", errorLinks);

  await browser.close();
}
