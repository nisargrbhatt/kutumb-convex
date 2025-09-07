import { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us",
};

const AboutUsPage = () => {
  return (
    <div className="px-4 py-8">
      <section className="text-center mb-12">
        <h1 className="text-4xl font-bold text-primary mb-2">
          About Gandhinagar Yuvak Mandal
        </h1>
        <p className="text-xl text-muted-foreground">
          Serving the Shree Sorthiya Shree Gaud Brahmin Community
        </p>
      </section>

      <section className="mb-12">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-3xl font-semibold mb-4">Our Mission</h2>
            <p className="text-lg text-muted-foreground mb-4">
              Gandhinagar Yuvak Mandal is dedicated to fostering a strong,
              connected, and vibrant community for all members of the Shree
              Sorthiya ShreeGaud Brahmin Samaj. Our primary goal is to unite our
              community members, preserve our rich cultural heritage, and
              provide a platform for social, cultural, and spiritual growth.
            </p>
            <p className="text-lg text-muted-foreground">
              This application is a key part of our initiative, created by the
              Gandhinagar Yuvak Mandal to serve our community&apos;s needs in
              the digital age.
            </p>
          </div>
          <div className="flex justify-center">
            {/* You can add an image of your community or logo here */}
            <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center">
              <span className="text-muted-foreground">Community Image</span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted rounded-lg p-8 mb-12">
        <h2 className="text-3xl font-semibold text-center mb-6">
          What We Offer
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          <div className="p-4">
            <h3 className="text-xl font-bold mb-2">People Directory</h3>
            <p>
              A comprehensive directory of our community members, making it easy
              to connect and stay in touch.
            </p>
          </div>
          <div className="p-4">
            <h3 className="text-xl font-bold mb-2">Relation Graph</h3>
            <p>
              Explore and understand the beautiful web of relationships that
              form our extended family tree.
            </p>
          </div>
          <div className="p-4">
            <h3 className="text-xl font-bold mb-2">Community Blogs</h3>
            <p>
              Share stories, knowledge, and updates with fellow community
              members through our blogging platform.
            </p>
          </div>
          <div className="p-4">
            <h3 className="text-xl font-bold mb-2">Photo Gallery</h3>
            <p>
              Relive cherished moments from community events and gatherings
              through our shared photo gallery.
            </p>
          </div>
        </div>
      </section>

      <section className="text-center">
        <h2 className="text-3xl font-semibold mb-4">Join Us</h2>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          We invite all members of the Shree Sorthiya Shree Gaud Brahmin
          community to join us in this endeavor. Together, we can build a
          stronger, more connected future for generations to come.
        </p>
      </section>
    </div>
  );
};

export default AboutUsPage;
