export const generateOrgSlug = (name: string) => {
	const twoRandomNumber = [Math.random(), Math.random()]
		.map((num) => Math.floor(num * 10))
		.join("");
	const sluggedName = name.toLowerCase().replaceAll(" ", "-");

	return [sluggedName, twoRandomNumber].join("");
};

export const generatePrimaryKey = () => crypto.randomUUID().replaceAll("-", "");
